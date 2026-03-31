const axios = require('axios');
const fs = require('fs');
const pdfParse = require('pdf-parse');

async function extractTextFromFile(file) {
    if (file.mimetype === 'application/pdf') {
        const dataBuffer = fs.readFileSync(file.path);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } else {
        return "Not a PDF, skipping MVP text extraction.";
    }
}

async function parseInvoicesAndMerge(files) {
    let allTexts = [];
    for (let i = 0; i < files.length; i++) {
        const text = await extractTextFromFile(files[i]);
        allTexts.push(`--- INVOICE ${i+1} ---\n${text}\n-------------------`);
        // Clean up uploaded file
        try {
            fs.unlinkSync(files[i].path);
        } catch(e) {
            console.error(e);
        }
    }
    
    const combinedText = allTexts.join('\n\n');
    
const prompt = `
Sei un assistente specializzato in contabilità. Di seguito hai il testo estratto da diverse fatture fornite tutte dallo stesso fornitore.
Devi estrarre i dati e unirle in un'unica fattura strutturata in formato JSON.

Regole di Unione:
1. Trova il "Fornitore" (Nome, P.IVA/Codice Fiscale).
2. Trova tutti gli articoli/voci presenti (Riferimento/Codice, descrizione, quantità, prezzo netto, aliquota IVA). Fai attenzione a prendere il prezzo netto (non ivato). Estrai l'IVA ESATTAMENTE come scritta sulla fattura (es. 0, 4, 10, 22). Non inventare l'IVA, se è 0 scrivi 0.
3. NON raggruppare MAI le righe tra loro, anche se hanno descrizione simile. Ogni riga di ogni fattura deve restare una riga separata con quantità originale, perché ogni riga ha un identificativo/riferimento diverso che è il dato che comanda.
4. Restituisci ESCLUSIVAMENTE un oggetto JSON valido con la seguente struttura:

{
  "entity": {
    "name": "Nome Fornitore",
    "vat_number": "Partita Iva / C.F."
  },
  "date": "YYYY-MM-DD",
  "articles": [
    {
      "code": "Codice_o_Riferimento_Articolo",
      "name": "Descrizione Articolo o Servizio",
      "qty": 2,
      "net_price": 10.50,
      "vat": {
        "value": 0
      }
    }
  ],
  "notes": "Fatture unite automaticamente con le fatture originali."
}

Testo delle fatture:
${combinedText}
    `;

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'google/gemini-2.5-pro',
                messages: [{ role: 'user', content: prompt }]
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        let content = response.data.choices[0].message.content;
        content = content.replace(/^\\s*\\\\\\`\\\\\\`\\\\\\`json/g, '').replace(/\\\\\\`\\\\\\`\\\\\\`\\s*$/g, '').trim();
        content = content.replace(/^```json/, '').replace(/```$/, '').trim();
        return JSON.parse(content);
    } catch (e) {
        console.error("OpenRouter API error:", e.response?.data || e.message);
        throw e;
    }
}

module.exports = { parseInvoicesAndMerge };
