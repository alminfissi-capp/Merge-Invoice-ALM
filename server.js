const express = require('express');
const multer = require('multer');
const cookieSession = require('cookie-session');
const dotenv = require('dotenv');
const os = require('os');
const path = require('path');
const { getAuthUrl, getToken, createInvoice } = require('./services/fattureincloud');
const { parseInvoicesAndMerge } = require('./services/openrouter');

dotenv.config();

const app = express();
const upload = multer({ dest: os.tmpdir() });

app.use(express.static('public'));
app.use(express.json());
app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'secret'],
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

app.get('/api/fic/status', (req, res) => {
    res.json({ connected: !!req.session.fic_token });
});

app.get('/api/fic/auth', (req, res) => {
    const authUrl = getAuthUrl();
    res.redirect(authUrl);
});

app.get('/api/fic/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const token = await getToken(code);
        req.session.fic_token = token;
        res.redirect('/?connected=true');
    } catch (err) {
        console.error("Error exchanging token:", err.message);
        res.status(500).send("Authentication failed: " + err.message);
    }
});

app.post('/api/merge-invoices', upload.array('invoices'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }
        
        console.log(`Received ${req.files.length} files for merging.`);
        const mergedData = await parseInvoicesAndMerge(req.files);
        
        req.session.mergedData = mergedData;
        res.json({ success: true, data: mergedData });
    } catch (error) {
        console.error("Error merging invoices:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/upload-fic', async (req, res) => {
    try {
        if (!req.session.fic_token) {
            return res.status(401).json({ error: 'Fatture in Cloud non connesso. Esegui il login prima.' });
        }
        
        const mergedData = req.body.invoiceData || req.session.mergedData;
        if (!mergedData) {
             return res.status(400).json({ error: 'Nessun dato fattura da caricare.' });
        }
        
        const result = await createInvoice(req.session.fic_token, mergedData);
        res.json({ success: true, result });
    } catch(err) {
        const apiError = err.response?.data?.error;
        const errorMessage = apiError ? (apiError.validation_result ? JSON.stringify(apiError.validation_result) : apiError.message) : err.message;
        console.error("Error uploading to FIC:", errorMessage);
        res.status(500).json({ error: errorMessage });
    }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
