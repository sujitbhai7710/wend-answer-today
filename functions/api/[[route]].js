/**
 * Pages Function - API proxy via Service Binding
 * Routes /api/* requests to the Worker internally
 * This avoids external API calls and reduces request counts
 */

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    // Build the internal request to the Worker
    const workerUrl = `https://wend-api-worker.wendapi.workers.dev${url.pathname}${url.search}`;
    
    // Use Service Binding if available, otherwise fall back to fetch
    if (env.WEND_API) {
        // Service Binding - internal call, no external request counted
        return env.WEND_API.fetch(request);
    }
    
    // Fallback: direct fetch (still works, but counts as external request)
    const newRequest = new Request(workerUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
    });
    
    const response = await fetch(newRequest);
    
    // Return with CORS headers
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}
