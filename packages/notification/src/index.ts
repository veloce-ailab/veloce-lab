import { Context } from "yumeri";
import type { PWAService } from "@velocelab/pwa";
import "@velocelab/dashboard";
import "@velocelab/pwa";
export const depend = ["dashboard", "pwa"];
export const provide = ["notification"];
const workerScript = `self.addEventListener('message',event=>{const data=event.data;if(!data||data.type!=='veloce.notification')return;void self.registration.showNotification(String(data.title||'Veloce'),{body:String(data.body||''),icon:data.icon||'/logo.png',tag:data.tag||undefined,data:{url:data.url||'/'}}))});self.addEventListener('push',event=>{const data=event.data?event.data.json():{};event.waitUntil(self.registration.showNotification(String(data.title||'Veloce'),{body:String(data.body||''),icon:data.icon||'/logo.png',tag:data.tag||undefined,data:{url:data.url||'/'}}))});self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{const url=event.notification.data&&event.notification.data.url||'/';const found=list.find(client=>client.url===new URL(url,self.location.origin).href);return found?found.focus():clients.openWindow(url)}))});`;
export function apply(ctx: Context) { const pwa = ctx.component.pwa as PWAService; const unregisterWorkerScript = pwa.registerWorkerScript("notification", workerScript); ctx.affect(unregisterWorkerScript); ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("./frontend/notification.js", import.meta.url).pathname, plugin: "notification" }); }
