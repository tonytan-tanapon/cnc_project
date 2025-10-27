////// old file 
api-client.js
list-pager.js
utils.js



//// new file
├── core/
│   ├── api.js                ← your existing jfetch(), toast()
│   ├── dom.js                ← $, createEl(), qs helpers
│   ├── utils.js              ← fmtDate, safe, trim, debounce
│   └── table.js              ← generic Tabulator setup (autosave, deleteRow)