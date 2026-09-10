export * from "./runtime"
export * from "./public"
export { DashboardFrameOutlet, frames, nav, pages, subscribeExtensions } from "./extension"
// `export *` intentionally excludes `default`. Plugin bundles compiled from
// JSX can still request React's default import, so expose it explicitly from
// the shared runtime.
export { default } from "./vendor"
export {
  Children, Component, PureComponent, Profiler, Suspense,
  Fragment, StrictMode, createContext, createElement, cloneElement, forwardRef,
  isValidElement, memo, lazy,
  useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useId,
  useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useReducer,
  useRef, useState, useSyncExternalStore, useTransition, startTransition,
  createRoot, hydrateRoot, createPortal, jsx, jsxs, FragmentJSX, jsxDEV,
} from "./vendor"
export * from "./vendor"
import {
  BrowserRouter as RouterBrowserRouter,
  Link as RouterLink,
  NavLink as RouterNavLink,
  Navigate as RouterNavigate,
  Outlet as RouterOutlet,
  Route as RouterRoute,
  Routes as RouterRoutes,
} from "react-router-dom"
export * from "react-router-dom"
export * from "@tanstack/react-query"
export * from "lucide-react"
// Keep host framework names deterministic when UI libraries expose the same names.
export {
  RouterLink as Link,
  RouterNavLink as NavLink,
  RouterNavigate as Navigate,
  RouterOutlet as Outlet,
  RouterRoute as Route,
  RouterRoutes as Routes,
  RouterBrowserRouter as BrowserRouter,
}

// Explicitly pin names that are also exported by lucide-react or react-router.
// Rollup otherwise drops the ambiguous star exports from the public runtime,
// which makes plugin imports such as `Table` fail at browser load time.
export { Badge } from "./components/ui/badge"
export { Calendar } from "./components/ui/calendar"
export { Sheet } from "./components/ui/sheet"
export { Sidebar } from "./components/ui/sidebar"
export { Table } from "./components/ui/table"
