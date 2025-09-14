import { createEntityPage } from "../entity/entity-page.js";
import { customersConfig } from "./customers.config.js";

document.addEventListener("DOMContentLoaded", () => {
  const page = createEntityPage(customersConfig);
  page.init();
});
