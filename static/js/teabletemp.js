document.addEventListener("DOMContentLoaded", () => {
  console.log("Tabulator available?", window.Tabulator);

  const table = new Tabulator("#listBody", {
    layout: "fitColumns",
    placeholder: "No Data",
    data: [
      {code: "C001", name: "Alice", contact: "Jane", email: "jane@example.com", phone: "555-1234", address: "123 Main St"},
      {code: "C002", name: "Bob", contact: "Tom", email: "tom@example.com", phone: "555-5678", address: "456 High St"},
    ],
    columns: [
      {title: "Code", field: "code"},
      {title: "Name", field: "name"},
      {title: "Contact", field: "contact"},
      {title: "Email", field: "email"},
      {title: "Phone", field: "phone"},
      {title: "Address", field: "address"},
    ],
  });
});
