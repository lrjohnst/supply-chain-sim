import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "./world.css";
import WorldBuilder from "./WorldBuilder";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorldBuilder />
  </StrictMode>
);
