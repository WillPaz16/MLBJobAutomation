import { Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Nav } from "./components/Nav";
import { Home } from "./pages/Home";
import { Discovery } from "./pages/Discovery";
import { Pipeline } from "./pages/Pipeline";
import { Prep } from "./pages/Prep";
import { Documents } from "./pages/Documents";
import { Analytics } from "./pages/Analytics";
import { NotFound } from "./pages/NotFound";

export function App() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Nav />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/discovery" element={<Discovery />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/prep" element={<Prep />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
