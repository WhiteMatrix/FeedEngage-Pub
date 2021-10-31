// (C) 2021 White Matrix. All rights reserved.

import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler';

addEventListener('fetch', event => {
    try {
        event.respondWith(eventRouter(event));
    } catch (e) {
        event.respondWith(new Response(JSON.stringify({success: false, errorCode: 1}), { status: 500 }));
    }
})

async function eventRouter(event) {
    const path = (new URL(event.request.url).pathname).split("/").slice(1);

    // Root
    if (path[0] === "") {
        const response = new Response(JSON.stringify({success: false, errorCode: 10}), {status: 400});
        response.headers.set("Content-Type", "application/json");
        return(response);
    }

    // Embed
    if (path[0] === "embed") {
        return(embedHandler(event));
    }

    // API
    if (path[0] === "api") {
        return(apiHandler(event, path));
    }

    // Nothing was caught
    const response = new Response(JSON.stringify({success: false, errorCode: 20}), {status: 400});
    response.headers.set("Content-Type", "application/json");
    return(response);
}

async function embedHandler(event) {
    let options = {};
    options.mapRequestToAsset = handlePrefix(/^\/embed/);
    try {
        const page = await getAssetFromKV(event, options);
        const response = new Response(page.body, page);
        return(response);
    } catch (e) {
        return(new Response(JSON.stringify({success: false, errorCode: 30}), {status: 404 }));
    }
}

async function apiHandler(event, path) {
    
    let response = undefined;

    // API routes: /api/manage/ & /api/display/
    if (path[1] === "manage") {
        // Export request body and method
        const jsonBody = await event.request.json();
        const httpMethod = event.request.method;

        // Check authentication
        if (jsonBody.authentication === API_MANAGE_KEY) {
            if (httpMethod === "POST") {
                // Submit new message to KV
                try {
                    // Get existing posts from KV
                    const currentPosts = await postsStore.get("posts", {type: "json"});
                    
                    // Create new post from submitted data
                    const newPost = {
                        postId: currentPosts.length > 0 ? currentPosts[currentPosts.length-1].postId+1 : 0,
                        postTitle: jsonBody.post.postTitle,
                        postContent: jsonBody.post.postContent,
                        postImage: jsonBody.post.postImage,
                        postImageAltText: jsonBody.post.postImageAltText,
                        postTimestamp: jsonBody.post.postTimestamp
                    }
                    // Write concatinated posts and return success
                    const writePosts = currentPosts.concat(newPost);
                    await postsStore.put("posts", JSON.stringify(writePosts));
                    response = new Response(JSON.stringify({success: true, postId: newPost.postId}));
                } catch (e) {
                    response = new Response(JSON.stringify({success: false, errorCode: 50}), {status: 500});
                }
            } else if (httpMethod === "DELETE") {
                // Delete message from KV
                try {
                    // Get existing posts from KV
                    const currentPosts = await postsStore.get("posts", {type: "json"});
                    
                    // Filter out the IDs requested
                    const writePosts = currentPosts.filter(item => item.postId !== jsonBody.id)
                    
                    // Write new array and return success
                    await postsStore.put("posts", JSON.stringify(writePosts));
                    response = new Response(JSON.stringify({success: true}));
                } catch (e) {
                    response = new Response(JSON.stringify({success: false, errorCode: 60}), {status: 500});
                }
            } else {
                // Verb was incorrect
                response = new Response(JSON.stringify({success: false, errorCode: 70}), {status: 400});
            }
        } else {
            response = new Response(JSON.stringify({success: false, errorCode: 80}), {status: 401});
        }
    } else if (path[1] === "display") {
        // Return post list
        try {
            // This element containes filtering ID
            const newerThanId = path[2];

            // Get posts from KV
            const posts = await postsStore.get("posts", {type: "json"});
            
            // Filter by ID and return
            const displayPosts = posts.filter(item => item.postId > newerThanId);
            response = new Response(JSON.stringify({success: true, posts: displayPosts}));
        } catch (e) {
            response = new Response(JSON.stringify({success: false, errorCode: 90}), {status: 500});
        }
    } //else if (path[1] === "init") {
        //await postsStore.put("posts", "[]");}
    else {
        // Unknown path
        response = new Response(JSON.stringify({success: false, errorCode: 40}), {status: 400})
    }

    response.headers.set("Content-Type", "application/json");
    //response.headers.set("Access-Control-Allow-Origin", "http://127.0.0.1:8080");
    return(response);
}

/* Adapted from https://github.com/cloudflare/worker-sites-template/blob/master/workers-site/index.js */
function handlePrefix(prefix) {
  return request => {
    let defaultAssetKey = mapRequestToAsset(request)
    let url = new URL(defaultAssetKey.url)
    url.pathname = url.pathname.replace(prefix, '/')
    return new Request(url.toString(), defaultAssetKey)
  }
}