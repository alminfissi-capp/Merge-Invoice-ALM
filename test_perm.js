const axios = require('axios');

async function debugPermission() {
    const token = 'a/eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyZWYiOiJlUE95MFQwUzhNSHQ4TUlQeFlOVXJ2TjlQOXFUSVpmZyIsImV4cCI6MTc3NTA0OTg2MH0.8-_8mrp7Ht4RetKXAv4vCnCknFBD1J4HjVPH9CfsjVo';
    const companyId = '649691';

    try {
        const payload = {
            data: {
                type: "self_supplier_invoice",
                date: "2026-03-31",
                entity: {
                    id: 51565069,
                    name: "AUCTANE S.L.U",
                    vat_number: "ESB83357863"
                },
                items_list: [{
                    product_id: null,
                    code: "",
                    name: "Test item",
                    net_price: 10,
                    qty: 1,
                    vat: { id: 0, value: 22 }
                }],
                description: "Test autofattura"
            }
        };

        const res = await axios.post(`https://api-v2.fattureincloud.it/c/${companyId}/issued_documents`, payload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("Success:", res.data);
    } catch(err) {
        console.error("Failed:", err.response?.data || err.message);
    }
}
debugPermission();
