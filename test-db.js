require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

async function getFullSchema() {
  try {
    const url = `${process.env.SUPABASE_URL}/rest/v1/`;
    const response = await axios.get(url, {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      }
    });

    if (response.data && response.data.definitions) {
      const definitions = response.data.definitions;
      let output = "# ZapKart Supabase Schema\n\n";

      for (const tableName of Object.keys(definitions)) {
        const table = definitions[tableName];
        output += `## Table: \`${tableName}\`\n`;
        if (table.description) {
          output += `${table.description}\n\n`;
        }
        output += "| Column | Type | Description |\n| :--- | :--- | :--- |\n";
        
        const properties = table.properties || {};
        for (const propName of Object.keys(properties)) {
          const prop = properties[propName];
          const type = prop.type + (prop.format ? ` (${prop.format})` : '');
          const desc = prop.description || '—';
          output += `| **${propName}** | \`${type}\` | ${desc} |\n`;
        }
        output += "\n";
      }

      fs.writeFileSync('schema.md', output);
      console.log('Schema written to schema.md successfully!');
    }
  } catch (err) {
    console.error('Error fetching schema:', err.message);
  }
}

getFullSchema();
