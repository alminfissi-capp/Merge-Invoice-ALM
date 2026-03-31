const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const FIC_CLIENT_ID = process.env.FIC_CLIENT_ID;
const FIC_CLIENT_SECRET = process.env.FIC_CLIENT_SECRET;
const REDIRECT_URI = process.env.FIC_REDIRECT_URI;

function getAuthUrl() {
    const scope = 'entity.clients:a entity.suppliers:a issued_documents.invoices:a issued_documents.self_invoices:a received_documents:a settings:r';
    return `https://api-v2.fattureincloud.it/oauth/authorize?response_type=code&client_id=${FIC_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}`;
}

async function getToken(authCode) {
    const response = await axios.post('https://api-v2.fattureincloud.it/oauth/token', {
        grant_type: 'authorization_code',
        client_id: FIC_CLIENT_ID,
        client_secret: FIC_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code: authCode
    });
    return response.data.access_token;
}

async function createInvoice(accessToken, invoiceData) {
    // 1. Get companies
    const companiesResponse = await axios.get('https://api-v2.fattureincloud.it/user/companies', {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!companiesResponse.data.data || companiesResponse.data.data.companies.length === 0) {
        throw new Error("No companies found.");
    }
    const companyId = companiesResponse.data.data.companies[0].id;
    
    // 2. Discover or create supplier
    let supplierId = null;
    if (invoiceData.entity && invoiceData.entity.vat_number) {
        try {
            const suppRes = await axios.get(`https://api-v2.fattureincloud.it/c/${companyId}/entities/suppliers`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: {
                    fieldset: 'detailed',
                    q: `vat_number = '${invoiceData.entity.vat_number}'`
                }
            });
            if (suppRes.data.data && suppRes.data.data.length > 0) {
                supplierId = suppRes.data.data[0].id;
            } else {
                 // Create supplier if not found
                 const createSuppResponse = await axios.post(`https://api-v2.fattureincloud.it/c/${companyId}/entities/suppliers`, {
                     data: {
                         name: invoiceData.entity.name || "Fornitore Sconosciuto",
                         vat_number: invoiceData.entity.vat_number,
                         country: "Italia"
                     }
                 }, {
                     headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                 });
                 supplierId = createSuppResponse.data.data.id;
            }
        } catch (e) {
             console.error("Supplier check/create error:", e.response?.data || e.message);
        }
    }

    // 3. Fetch VAT types to dynamically map extracted VAT values
    let vatMap = {};
    try {
        const vatRes = await axios.get(`https://api-v2.fattureincloud.it/c/${companyId}/info/vat_types`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        vatRes.data.data.forEach(v => {
            if (!vatMap[v.value] && !v.is_disabled) {
                vatMap[v.value] = v.id;
            }
        });
    } catch (e) {
        console.error("Could not fetch VAT types:", e.message);
    }
    // Default fallback 22% is id 0
    vatMap[22] = vatMap[22] !== undefined ? vatMap[22] : 0;

    const vatGroups = {};
    invoiceData.articles.forEach(a => {
        const vatRate = a.vat?.value ?? 22;
        if (!vatGroups[vatRate]) vatGroups[vatRate] = 0;
        vatGroups[vatRate] += (a.qty * a.net_price);
    });

    let totalGross = 0;
    for (const rate in vatGroups) {
        const net = Math.round(vatGroups[rate] * 100) / 100; // Total net for this VAT rate
        const vat = Math.round(net * rate) / 100;            // Tax for this VAT rate
        totalGross += (net + vat);
    }
    totalGross = Math.round(totalGross * 100) / 100;

    const payload = {
        data: {
            type: "self_supplier_invoice",
            date: invoiceData.date || new Date().toISOString().split('T')[0],
            entity: {
                id: supplierId,
                name: invoiceData.entity?.name || "Fornitore Sconosciuto",
                vat_number: invoiceData.entity?.vat_number || ""
            },
            items_list: invoiceData.articles.map(a => ({
                product_id: null,
                code: a.code || "",
                name: a.name,
                net_price: a.net_price,
                qty: a.qty,
                vat: {
                    id: vatMap[a.vat?.value ?? 0] !== undefined ? vatMap[a.vat?.value ?? 0] : (a.vat?.value === 22 ? 0 : null),
                    value: a.vat?.value ?? 0
                }
            })),
            payments_list: [{
                amount: totalGross,
                due_date: invoiceData.date || new Date().toISOString().split('T')[0],
                status: "not_paid"
            }],
            description: invoiceData.notes || "Fatture unite dal sistema"
        }
    };
    
    const createResponse = await axios.post(`https://api-v2.fattureincloud.it/c/${companyId}/issued_documents`, payload, {
        headers: { 
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });
    
    return createResponse.data;
}

module.exports = { getAuthUrl, getToken, createInvoice };
