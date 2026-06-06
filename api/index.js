const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const busboy = require('busboy');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// In-memory storage (for Vercel, use a proper database in production)
// Format: { code: { passwordHash, filename, filepath, createdAt, expiresAt, firstDownloadTime, deleteTimeout } }
const fileStorage = new Map();

// Cleanup interval - delete expired files every 5 minutes
setInterval(cleanupExpiredFiles, 5 * 60 * 1000);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join('/tmp', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * POST /api/upload
 * Upload a file and set a password
 */
app.post('/api/upload', (req, res) => {
    const bb = busboy({ headers: req.headers });
    let file = null;
    let password = null;
    let fileData = {
        buffer: Buffer.alloc(0),
        filename: '',
        mimetype: ''
    };

    // Handle file field
    bb.on('file', (fieldname, file, info) => {
        const chunks = [];

        file.on('data', (data) => {
            chunks.push(data);
            // Limit file size to 100MB
            const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            if (totalSize > 100 * 1024 * 1024) {
                file.destroy();
                bb.destroy();
                return res.status(400).json({ error: 'File size exceeds 100MB limit' });
            }
        });

        file.on('end', () => {
            fileData.buffer = Buffer.concat(chunks);
            fileData.filename = info.filename;
            fileData.mimetype = info.mimeType;
        });
    });

    // Handle password field
    bb.on('field', (fieldname, val) => {
        if (fieldname === 'password') {
            password = val;
        }
    });

    bb.on('close', async () => {
        try {
            // Validation
            if (!fileData.buffer || fileData.buffer.length === 0) {
                return res.status(400).json({ error: 'No file provided' });
            }

            if (!password || password.trim() === '') {
                return res.status(400).json({ error: 'Password is required' });
            }

            // Hash password
            const saltRounds = 10;
            const passwordHash = await bcrypt.hash(password, saltRounds);

            // Generate unique code
            const code = generateCode();

            // Save file to tmp directory
            const fileName = `${code}_${Date.now()}_${fileData.filename}`;
            const filePath = path.join(uploadsDir, fileName);

            fs.writeFileSync(filePath, fileData.buffer);

            // Store metadata
            const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
            fileStorage.set(code, {
                passwordHash,
                filename: fileData.filename,
                filepath: filePath,
                createdAt: Date.now(),
                expiresAt,
                firstDownloadTime: null,
                deleteTimeout: null
            });

            res.json({ code });
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ error: 'Upload failed' });
        }
    });

    req.pipe(bb);
});

/**
 * POST /api/download
 * Verify password and get download link
 */
app.post('/api/download', async (req, res) => {
    try {
        const { code, password } = req.body;

        if (!code || !password) {
            return res.status(400).json({ error: 'Code and password are required' });
        }

        // Check if code exists
        const fileInfo = fileStorage.get(code);
        if (!fileInfo) {
            return res.status(404).json({ error: 'File not found or expired' });
        }

        // Check if file has expired
        if (Date.now() > fileInfo.expiresAt) {
            fileStorage.delete(code);
            // Delete physical file
            if (fs.existsSync(fileInfo.filepath)) {
                fs.unlinkSync(fileInfo.filepath);
            }
            return res.status(404).json({ error: 'File has expired' });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, fileInfo.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        // Check if file exists
        if (!fs.existsSync(fileInfo.filepath)) {
            fileStorage.delete(code);
            return res.status(404).json({ error: 'File not found' });
        }

        // Set first download time if this is the first download
        if (fileInfo.firstDownloadTime === null) {
            fileInfo.firstDownloadTime = Date.now();
            
            // Schedule deletion 3 minutes after first download
            if (fileInfo.deleteTimeout) {
                clearTimeout(fileInfo.deleteTimeout);
            }
            
            fileInfo.deleteTimeout = setTimeout(() => {
                scheduleFileDeletion(code);
            }, 3 * 60 * 1000); // 3 minutes
        }

        // Read file and create download link
        const fileBuffer = fs.readFileSync(fileInfo.filepath);
        const downloadUrl = `/api/download-file/${code}/${Buffer.from(fileInfo.filename).toString('base64')}`;

        res.json({
            downloadUrl,
            filename: fileInfo.filename
        });
    } catch (error) {
        console.error('Download verify error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

/**
 * GET /api/download-file/:code/:filename
 * Actually download the file (file is NOT deleted on this endpoint)
 */
app.get('/api/download-file/:code/:encodedFilename', (req, res) => {
    try {
        const { code } = req.params;

        // Check if code exists
        const fileInfo = fileStorage.get(code);
        if (!fileInfo) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Check if file exists
        if (!fs.existsSync(fileInfo.filepath)) {
            fileStorage.delete(code);
            return res.status(404).json({ error: 'File not found' });
        }

        // Send file (don't delete it here - deletion happens via timeout)
        res.download(fileInfo.filepath, fileInfo.filename, (err) => {
            if (err) {
                console.error('Download error:', err);
            }
        });
    } catch (error) {
        console.error('File download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

/**
 * Schedule file deletion 3 minutes after first download
 */
function scheduleFileDeletion(code) {
    const fileInfo = fileStorage.get(code);
    if (fileInfo) {
        fileStorage.delete(code);
        // Delete physical file
        if (fs.existsSync(fileInfo.filepath)) {
            try {
                fs.unlinkSync(fileInfo.filepath);
                console.log(`File deleted for code: ${code}`);
            } catch (error) {
                console.error('Error deleting file:', error);
            }
        }
    }
}

/**
 * Cleanup expired files
 */
function cleanupExpiredFiles() {
    const now = Date.now();
    for (const [code, fileInfo] of fileStorage.entries()) {
        if (now > fileInfo.expiresAt) {
            // Clear timeout if exists
            if (fileInfo.deleteTimeout) {
                clearTimeout(fileInfo.deleteTimeout);
            }
            
            fileStorage.delete(code);
            // Delete physical file
            if (fs.existsSync(fileInfo.filepath)) {
                try {
                    fs.unlinkSync(fileInfo.filepath);
                } catch (error) {
                    console.error('Error deleting file:', error);
                }
            }
        }
    }
}

/**
 * Generate a random shareable code
 */
function generateCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
