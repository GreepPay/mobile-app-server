"use strict";

const sharp = require("sharp");
const express = require("express");
const axios = require("axios");
const isBot = require("isbot");
const fs = require("fs");
const crypto = require("crypto");

// Load environment variables
require("dotenv").config();

// Load path
const path = require("path");

// Constants
const PORT = 8080;
const HOST = "0.0.0.0";

// App
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "../../app/dist")));

// Middleware to detect bots
app.use((req, res, next) => {
  const userAgent = req.headers["user-agent"] || "";
  if (isBot.isbot(userAgent)) {
    req.isBot = true;
  } else {
    req.isBot = false;
  }
  next();
});

// Stores compressed images in /tmp or a folder you choose
const COMPRESSED_DIR = "/tmp/greep-seo-images";

app.use("/seo-img", express.static(COMPRESSED_DIR));

if (!fs.existsSync(COMPRESSED_DIR)) {
  fs.mkdirSync(COMPRESSED_DIR, { recursive: true });
}

async function compressImageFromUrl(imageUrl) {
  try {
    // Fetch remote image as buffer
    const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);

    // Create a hashed output name
    const hash = crypto.createHash("md5").update(imageUrl).digest("hex");
    const outputPath = `${COMPRESSED_DIR}/${hash}.jpg`;

    // If cached, return existing file
    if (fs.existsSync(outputPath)) {
      return outputPath;
    }

    // Compress + resize (1200×630 recommended for og:image)
    await sharp(buffer)
      .resize({ width: 1200, height: 630, fit: "cover" })
      .jpeg({ quality: 70 }) // adjust this for smaller size
      .toFile(outputPath);

    return outputPath;
  } catch (err) {
    console.error("Image compression failed:", err.message);
    return null;
  }
}

app.get("/*", async (req, res) => {
  const urlPath = req.url.replace(/^\/+|\/+$/g, "");
  const urlIsResolved = req.query.resolved;

  // If it's already resolved or no API configured, serve the SPA
  if (urlIsResolved || !process.env.APP_BASE_URL) {
    return res.sendFile(path.join(__dirname, "../../app/dist/index.html"));
  }
  if (!req.isBot) {
    return res.sendFile(path.join(__dirname, "../../app/dist/index.html"));
  }
  try {
    // Check if the path matches product or business pattern
    const productMatch = urlPath.match(/^products\/([a-f0-9-]+)$/);
    const businessMatch = urlPath.match(/^shops\/([a-f0-9-]+)$/);
    const eventMatch = urlPath.match(/^events\/([a-f0-9-]+)$/);

    let contentType = "";
    let uuid = "";
    let finalUrl = "";

    // SEO meta tags
    let title = "";
    let description = "";
    let image = "";

    if (productMatch) {
      contentType = "product";
      uuid = productMatch[1];
      // Remove queries from uuid if any
      let uuidWithoutQuery = uuid.split("?")[0];
      finalUrl = `${process.env.APP_BASE_URL}/products/${uuid}?resolved=true`;

      // Fetch product details from Laravel API
      try {
        const productResponse = await axios.get(
          `${process.env.API_BASE_URL}/details/product/${uuidWithoutQuery}`
        );
        const product = productResponse.data.data;

        title =
          "Buy " + (product.name + " on GreepPay") || "Product on GreepPay";
        description =
          product.description || `Check out this amazing product on our Greep`;
        const images = JSON.parse(product.images || "[]");
        const originalImageUrl = images?.[0]?.url || "";

        let compressedPath = null;
        if (originalImageUrl) {
          compressedPath = await compressImageFromUrl(originalImageUrl);
        }

        image = compressedPath
          ? `${process.env.APP_BASE_URL}/seo-img/${path.basename(
              compressedPath
            )}`
          : originalImageUrl;
      } catch (error) {
        console.log("Product not found, serving SPA");
        return res.sendFile(path.join(__dirname, "../../app/dist/index.html"));
      }
    } else if (eventMatch) {
      contentType = "product";
      uuid = eventMatch[1];
      // Remove queries from uuid if any
      let uuidWithoutQuery = uuid.split("?")[0];
      finalUrl = `${process.env.APP_BASE_URL}/products/${uuid}?resolved=true`;

      // Fetch product details from Laravel API
      try {
        const eventResponse = await axios.get(
          `${process.env.API_BASE_URL}/details/product/${uuidWithoutQuery}`
        );
        const event = eventResponse.data.data;

        title =
          "Buy " + (event.name + " tickets on GreepPay") || "Event on GreepPay";
        description =
          event.description || `Check out this amazing event on our Greep`;
        const images = JSON.parse(event.images || "[]");
        const originalImageUrl = images?.[0]?.url || "";

        let compressedPath = null;
        if (originalImageUrl) {
          compressedPath = await compressImageFromUrl(originalImageUrl);
        }

        image = compressedPath
          ? `${process.env.APP_BASE_URL}/seo-img/${path.basename(
              compressedPath
            )}`
          : originalImageUrl;
      } catch (error) {
        console.log("Event not found, serving SPA");
        return res.sendFile(path.join(__dirname, "../../app/dist/index.html"));
      }
    } else if (businessMatch) {
      contentType = "business";
      uuid = businessMatch[1];
      // Remove queries from uuid if any
      let uuidWithoutQuery = uuid.split("?")[0];
      finalUrl = `${process.env.APP_BASE_URL}/shops/${uuid}?resolved=true`;

      // Fetch business details
      try {
        const businessResponse = await axios.get(
          `${process.env.API_BASE_URL}/details/business/${uuidWithoutQuery}`
        );
        const business = businessResponse.data.data;

        title =
          business.business_name + " on GreepPay" || "Business on GreepPay";
        description =
          business.description || `Discover this business on our Greep`;
        const originalImageUrl = business.logo || business.photo_url || "";

        let compressedPath = null;
        if (originalImageUrl) {
          compressedPath = await compressImageFromUrl(originalImageUrl);
        }

        image = compressedPath
          ? `${process.env.APP_BASE_URL}/seo-img/${path.basename(
              compressedPath
            )}`
          : originalImageUrl;
      } catch (error) {
        console.log("Business not found, serving SPA");
        return res.sendFile(path.join(__dirname, "../../app/dist/index.html"));
      }
    } else {
      // Not a product or business URL, serve SPA
      return res.sendFile(path.join(__dirname, "../../app/dist/index.html"));
    }

    // Handle bots with SEO meta tags
    if (req.isBot) {
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <base href="/" />
    
    <!-- SEO Meta Tags -->
    <meta name="description" content="${description}" />
    
    <!-- Open Graph Meta Tags -->
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image || "https://greep.io/"}" />
    <meta property="og:url" content="${finalUrl}" />
    <meta property="og:type" content="${
      contentType === "product" ? "product" : "website"
    }" />
    
    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image || "https://greep.io/"}" />

    <!-- Existing Meta Tags -->
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="https://greep.io/" rel="shortcut icon" type="image/x-icon" />
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${description}</p>
      ${image ? `<img src="${image}" alt="${title}" />` : ""}
      <p><a href="${finalUrl}">View ${contentType} on Greep</a></p>
    </main>
  </body>
</html>`;

      res.send(htmlContent);
    } else {
      // Regular users get redirected to the actual page
      res.redirect(finalUrl);
    }
  } catch (error) {
    console.error("Error handling request:", error);
    res.sendFile(path.join(__dirname, "../../app/dist/index.html"));
  }
});

app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);
