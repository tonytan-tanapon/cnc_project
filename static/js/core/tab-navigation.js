export function enableTabNavigation(table) {
  function getEditableFields(tab) {
    return tab
      .getColumns(true)
      .filter((c) => c.getDefinition()?.editor)
      .map((c) => c.getField());
  }

  function focusNext(cell, dir) {
    const row = cell.getRow();
    const tab = row.getTable();
    const fields = getEditableFields(tab);

    const rIdx = tab.getRows().indexOf(row);
    const fIdx = fields.indexOf(cell.getField());

    let nf = fIdx + dir;
    let nr = rIdx;

    if (nf >= fields.length) {
      nf = 0;
      nr++;
    }
    if (nf < 0) {
      nf = fields.length - 1;
      nr--;
    }

    const targetRow = tab.getRows()[nr];
    targetRow?.getCell(fields[nf])?.edit(true);
  }

  table.on("cellEditing", (cell) => {
    setTimeout(() => {
      const input = cell.getElement()?.querySelector("input, textarea");
      if (!input) return;

      input.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          focusNext(cell, e.shiftKey ? -1 : 1);
        }
      });
    });
  });
}
