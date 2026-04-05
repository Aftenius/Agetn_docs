import { Route, Routes } from "react-router-dom";
import { DocumentsHome } from "./DocumentsHome";
import { EditorPage } from "./EditorPage";
import { WorkspaceSettingsPage } from "./WorkspaceSettingsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DocumentsHome />} />
      <Route path="/workspace" element={<WorkspaceSettingsPage />} />
      <Route path="/doc/:id" element={<EditorPage />} />
    </Routes>
  );
}
