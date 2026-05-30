# Secure File Transfer

A simple, secure way to transfer files with password protection. Upload a file, set a password, share the code with someone, and they can download it by entering the correct password. Files are automatically deleted after 24 hours or after successful download.
Find the page here: https://file-transfer-opal.vercel.app/

## Features

✅ **Password Protected** - Set a password for each uploaded file  
✅ **Secure Sharing** - Get a unique code to share with recipients  
✅ **Auto Deletion** - Files are deleted after 24 hours or after download  
✅ **File Size Limit** - Up to 100MB per file  
✅ **No Database Required** - Works great on Vercel  
✅ **Beautiful UI** - Modern, responsive design  

## Getting Started

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/LightningEX/file-transfer.git
cd file-transfer
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Deploy to Vercel

1. Push to GitHub
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "Add New" → "Project"
4. Import the `file-transfer` repository
5. Click "Deploy"

That's it! Your file transfer app is now live.

## How to Use

### For the Sender:
1. Click "Upload & Share"
2. Select a file (up to 100MB)
3. Enter a password
4. Click "Upload & Generate Code"
5. Share the generated code with the recipient

### For the Recipient:
1. Click "Download File"
2. Paste the share code
3. Enter the password
4. Click "Verify & Download"
5. The file will download and be automatically deleted

## Project Structure

```
file-transfer/
├── api/
│   └── index.js          # Express backend
├── public/
│   └── index.html        # Frontend UI
├── package.json
├── vercel.json
├── .gitignore
└── README.md
```

## Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js, Express.js
- **Security**: bcryptjs (password hashing)
- **Deployment**: Vercel

## Security Notes

⚠️ This implementation uses in-memory storage suitable for demo purposes. For production with concurrent users, consider:

- Using a persistent database (MongoDB, PostgreSQL, etc.)
- Implementing rate limiting
- Adding HTTPS enforcement
- Adding request logging and monitoring
- Implementing IP-based rate limiting for password attempts

## File Size Limits

- **Upload Limit**: 100MB per file
- **Storage Duration**: 24 hours maximum
- **Storage Method**: Temporary file system (cleared after successful download)

## API Endpoints

### POST `/api/upload`
Upload a file with password protection.

**Body:**
- `file` - File to upload (multipart/form-data)
- `password` - Password for the file

**Response:**
```json
{
  "code": "ABC12345"
}
```

### POST `/api/download`
Verify password and get download link.

**Body:**
```json
{
  "code": "ABC12345",
  "password": "user_password"
}
```

**Response:**
```json
{
  "downloadUrl": "/api/download-file/ABC12345/...",
  "filename": "document.pdf"
}
```

### GET `/api/download-file/:code/:filename`
Download the file (automatically deletes after download).

## Environment Variables

Currently, no environment variables are required. The app uses port 3000 by default, which can be overridden with the `PORT` environment variable.

## License

MIT License - see LICENSE file for details

## Contributing

Feel free to fork and submit pull requests!

## Support

If you encounter any issues:
1. Check that Node.js version is 14+
2. Ensure all dependencies are installed: `npm install`
3. Check that port 3000 is available (or set a different PORT)
4. Review browser console for frontend errors
5. Check server logs for backend errors
