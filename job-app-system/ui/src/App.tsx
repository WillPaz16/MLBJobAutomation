import { Route, Routes } from "react-router-dom";
import { Nav } from "./components/Nav";
import { Discovery } from "./pages/Discovery";
import { Pipeline } from "./pages/Pipeline";
import { Documents } from "./pages/Documents";
import { Analytics } from "./pages/Analytics";

export function App() {
  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Nav />
      <Routes>
        <Route path="/" element={<Discovery />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </div>
  );
}
