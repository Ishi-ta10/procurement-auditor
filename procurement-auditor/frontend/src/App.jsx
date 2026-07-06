import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Invoices from "./pages/Invoices.jsx";
import Upload from "./pages/Upload.jsx";
import InvoiceDetail from "./pages/InvoiceDetail.jsx";
import PurchaseOrders from "./pages/PurchaseOrders.jsx";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/purchase-orders" element={<PurchaseOrders />} />
      </Routes>
    </Layout>
  );
}
