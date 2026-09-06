import http from "node:http";
import { prisma } from "./db.js";
const MAX_BODY_CHARS = 780_000;
const MAX_IMAGE_CHARS = 700_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_DATA = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i;
function corsHeaders(webOrigin) {
    return {
        "access-control-allow-origin": webOrigin,
        "access-control-allow-headers": "Authorization, Content-Type",
        "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
        vary: "Origin",
    };
}
function sendJson(response, webOrigin, status, data) {
    response.writeHead(status, { ...corsHeaders(webOrigin), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify(data));
}
function internalJson(internalPort, path, authorization) {
    return new Promise((resolve) => {
        const request = http.request({ hostname: "127.0.0.1", port: internalPort, path, method: "GET", headers: authorization ? { authorization } : {} }, (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => { body += chunk; });
            response.on("end", () => {
                try {
                    resolve({ ok: (response.statusCode ?? 500) < 300, data: body ? JSON.parse(body) : {} });
                }
                catch {
                    resolve({ ok: false, data: {} });
                }
            });
        });
        request.on("error", () => resolve({ ok: false, data: {} }));
        request.end();
    });
}
async function memberId(internalPort, authorization) {
    if (!authorization?.startsWith("Bearer "))
        return null;
    const session = await internalJson(internalPort, "/auth/session", authorization);
    return session.ok && session.data?.mode === "member" && typeof session.data?.user?.id === "string" ? session.data.user.id : null;
}
function readJson(request) {
    return new Promise((resolve, reject) => {
        let body = "";
        let failed = false;
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
            if (failed)
                return;
            body += chunk;
            if (body.length > MAX_BODY_CHARS) {
                failed = true;
                reject(new Error("Image is too large"));
            }
        });
        request.on("end", () => {
            if (failed)
                return;
            try {
                resolve(body ? JSON.parse(body) : {});
            }
            catch {
                reject(new Error("Invalid request"));
            }
        });
        request.on("error", reject);
    });
}
function validImage(dataUrl) {
    return typeof dataUrl === "string" && dataUrl.length <= MAX_IMAGE_CHARS && IMAGE_DATA.test(dataUrl);
}
export async function handleMediaRequest(request, response, internalPort, webOrigin, broadcast) {
    const path = (request.url ?? "").split("?")[0];
    if (!path.startsWith("/media/"))
        return false;
    if (request.method === "OPTIONS") {
        response.writeHead(204, corsHeaders(webOrigin));
        response.end();
        return true;
    }
    const userId = await memberId(internalPort, request.headers.authorization);
    if (!userId) {
        sendJson(response, webOrigin, 401, { error: "Member sign-in required" });
        return true;
    }
    if (request.method === "PUT" && path === "/media/profile") {
        try {
            const payload = await readJson(request);
            if (!validImage(payload?.dataUrl)) {
                sendJson(response, webOrigin, 400, { error: "Choose a valid JPG, PNG or WebP image" });
                return true;
            }
            await prisma.user.update({ where: { id: userId }, data: { profileImageData: payload.dataUrl } });
            sendJson(response, webOrigin, 200, { ok: true });
        }
        catch (error) {
            sendJson(response, webOrigin, 400, { error: error instanceof Error ? error.message : "Could not save image" });
        }
        return true;
    }
    if (request.method === "DELETE" && path === "/media/profile") {
        await prisma.user.update({ where: { id: userId }, data: { profileImageData: null } });
        sendJson(response, webOrigin, 200, { ok: true });
        return true;
    }
    const profileMatch = path.match(/^\/media\/profile\/([^/]+)$/);
    if (request.method === "GET" && profileMatch) {
        const id = profileMatch[1];
        if (!UUID.test(id)) {
            sendJson(response, webOrigin, 400, { error: "Invalid member" });
            return true;
        }
        const user = await prisma.user.findUnique({ where: { id }, select: { profileImageData: true, suspendedAt: true } });
        if (!user || user.suspendedAt || !user.profileImageData) {
            sendJson(response, webOrigin, 404, { error: "No profile photo" });
            return true;
        }
        sendJson(response, webOrigin, 200, { dataUrl: user.profileImageData });
        return true;
    }
    if (request.method === "POST" && path === "/media/posts") {
        try {
            const payload = await readJson(request);
            const text = typeof payload?.body === "string" ? payload.body.trim() : "";
            if (text.length > 2500) {
                sendJson(response, webOrigin, 400, { error: "Post is too long" });
                return true;
            }
            if (!validImage(payload?.dataUrl)) {
                sendJson(response, webOrigin, 400, { error: "Choose a valid JPG, PNG or WebP image" });
                return true;
            }
            const post = await prisma.post.create({ data: { authorId: userId, body: text, imageData: payload.dataUrl }, select: { id: true, body: true, createdAt: true } });
            broadcast("community");
            sendJson(response, webOrigin, 201, { post });
        }
        catch (error) {
            sendJson(response, webOrigin, 400, { error: error instanceof Error ? error.message : "Could not publish image" });
        }
        return true;
    }
    const postMatch = path.match(/^\/media\/posts\/([^/]+)$/);
    if (request.method === "GET" && postMatch) {
        const id = postMatch[1];
        if (!UUID.test(id)) {
            sendJson(response, webOrigin, 400, { error: "Invalid post" });
            return true;
        }
        const post = await prisma.post.findUnique({ where: { id }, select: { imageData: true, author: { select: { suspendedAt: true } } } });
        if (!post || post.author.suspendedAt || !post.imageData) {
            sendJson(response, webOrigin, 404, { error: "No post image" });
            return true;
        }
        sendJson(response, webOrigin, 200, { dataUrl: post.imageData });
        return true;
    }
    sendJson(response, webOrigin, 404, { error: "Media route not found" });
    return true;
}
