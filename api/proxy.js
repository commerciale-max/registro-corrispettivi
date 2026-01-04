module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Endpoint, X-Api-Environment');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const endpoint = req.headers['x-api-endpoint'];
        const environment = req.headers['x-api-environment'] || 'sandbox';
        const authorization = req.headers['authorization'];

        if (!endpoint) {
            res.status(400).json({ error: 'Missing X-Api-Endpoint header' });
            return;
        }

        if (!authorization) {
            res.status(401).json({ error: 'Missing Authorization header' });
            return;
        }

        const baseUrl = environment === 'production' 
            ? 'https://api.openapi.it' 
            : 'https://sandbox.openapi.it';

        const apiUrl = `${baseUrl}${endpoint}`;

        const fetchOptions = {
            method: req.method,
            headers: {
                'Authorization': authorization,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        if (req.method === 'POST' || req.method === 'PATCH') {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetch(apiUrl, fetchOptions);
        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        res.status(response.status).json(data);

    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ 
            error: 'Errore di connessione al server OpenAPI',
            details: error.message 
        });
    }
};
