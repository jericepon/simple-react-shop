import { createBrowserRouter } from "react-router";
import Products from "@/views/Products";
import Home from "@/views/Home";

export const router = createBrowserRouter([
  { path: "/", Component: Home },
  { path: "/products", Component: Products },
]);
