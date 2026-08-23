const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const YAML = require("yamljs");
const swaggerUi = require("swagger-ui-express");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- CORS ----------
// Allow any frontend origin (Netlify, Vercel, localhost, etc.) to call this API
// and to load the Swagger docs without CORS errors.
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors());

// ---------- Setup ----------
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json());
app.use(
  "/uploads",
  cors({ origin: "*" }),
  express.static(UPLOAD_DIR, { maxAge: "7d" })
);

// In-memory "database"
const products = new Map();

// ---------- Swagger UI ----------
const swaggerDocument = YAML.load(path.join(__dirname, "openapi.yaml"));
app.use(
  "/api-docs",
  cors({ origin: "*" }),
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument)
);
app.get("/openapi.yaml", cors({ origin: "*" }), (req, res) =>
  res.sendFile(path.join(__dirname, "openapi.yaml"))
);

// ---------- Multer config (image uploads, kept in memory so sharp can compress before saving) ----------
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_UPLOAD_FILE_SIZE = 15 * 1024 * 1024; // 15 MB raw upload limit (before compression)
const MIN_IMAGES = 2;
const MAX_IMAGES = 6;

// Compression targets: resize down and re-encode as webp so stored files are small and fast to serve
const COMPRESS_MAX_WIDTH = 1280;
const COMPRESS_QUALITY = 72;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_FILE_SIZE, files: MAX_IMAGES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error("UNSUPPORTED_FILE_TYPE"));
    }
    cb(null, true);
  },
});

async function compressAndSave(fileBuffer) {
  const filename = `img_${uuidv4()}.webp`;
  const outputPath = path.join(UPLOAD_DIR, filename);

  await sharp(fileBuffer)
    .rotate() // auto-orient based on EXIF
    .resize({ width: COMPRESS_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: COMPRESS_QUALITY })
    .toFile(outputPath);

  const stats = fs.statSync(outputPath);
  return { filename, size: stats.size };
}

// ---------- Pricing helpers ----------
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function withComputedFields(product) {
  const totalCost = round2(product.costPrice * product.quantity);
  const totalRevenue = round2(product.sellPrice * product.quantity);
  const profitPerUnit = round2(product.sellPrice - product.costPrice);
  const totalProfit = round2(totalRevenue - totalCost);

  return {
    id: product.id,
    name: product.name,
    quantity: product.quantity,
    costPrice: product.costPrice,
    sellPrice: product.sellPrice,
    profitPerUnit,
    totalCost,
    totalRevenue,
    totalProfit,
    images: product.images,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

// ---------- Validation helpers ----------
function validateProductInput(body, { partial = false } = {}) {
  const errors = [];
  const { name, quantity, costPrice, sellPrice } = body || {};

  if (!partial || name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      errors.push("name is required and must be a non-empty string");
    } else if (name.length > 200) {
      errors.push("name must be 200 characters or fewer");
    }
  }

  if (!partial || quantity !== undefined) {
    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 0
    ) {
      errors.push("quantity is required and must be a non-negative integer");
    }
  }

  if (!partial || costPrice !== undefined) {
    if (typeof costPrice !== "number" || isNaN(costPrice) || costPrice < 0) {
      errors.push("costPrice is required and must be a non-negative number (purchase price per unit)");
    }
  }

  if (!partial || sellPrice !== undefined) {
    if (typeof sellPrice !== "number" || isNaN(sellPrice) || sellPrice < 0) {
      errors.push("sellPrice is required and must be a non-negative number (selling price per unit)");
    }
  }

  return errors;
}

function getProductOr404(req, res) {
  const product = products.get(req.params.productId);
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return null;
  }
  return product;
}

// ================= Product routes =================

// GET /api/products
app.get("/api/products", (req, res) => {
  res.status(200).json(Array.from(products.values()).map(withComputedFields));
});

// POST /api/products
app.post("/api/products", (req, res) => {
  const errors = validateProductInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  const now = new Date().toISOString();
  const product = {
    id: uuidv4(),
    name: req.body.name.trim(),
    quantity: req.body.quantity,
    costPrice: req.body.costPrice,
    sellPrice: req.body.sellPrice,
    images: [],
    createdAt: now,
    updatedAt: now,
  };
  products.set(product.id, product);
  res.status(201).json(withComputedFields(product));
});

// GET /api/products/:productId
app.get("/api/products/:productId", (req, res) => {
  const product = getProductOr404(req, res);
  if (!product) return;
  res.status(200).json(withComputedFields(product));
});

// PUT /api/products/:productId
app.put("/api/products/:productId", (req, res) => {
  const product = getProductOr404(req, res);
  if (!product) return;

  const errors = validateProductInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  product.name = req.body.name.trim();
  product.quantity = req.body.quantity;
  product.costPrice = req.body.costPrice;
  product.sellPrice = req.body.sellPrice;
  product.updatedAt = new Date().toISOString();

  res.status(200).json(withComputedFields(product));
});

// DELETE /api/products/:productId
app.delete("/api/products/:productId", (req, res) => {
  const product = getProductOr404(req, res);
  if (!product) return;

  for (const img of product.images) {
    const filePath = path.join(UPLOAD_DIR, path.basename(img.url));
    fs.unlink(filePath, () => {});
  }

  products.delete(product.id);
  res.status(204).send();
});

// ================= Image routes =================

// POST /api/products/:productId/images  (2-6 images, field name "images", auto-compressed)
app.post("/api/products/:productId/images", (req, res) => {
  const product = getProductOr404(req, res);
  if (!product) return;

  upload.array("images", MAX_IMAGES)(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            error: "Validation failed",
            details: [`Each image must be ${MAX_UPLOAD_FILE_SIZE / (1024 * 1024)} MB or smaller`],
          });
        }
        if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            error: "Validation failed",
            details: [`You may upload a maximum of ${MAX_IMAGES} images`],
          });
        }
        return res.status(400).json({ error: "Validation failed", details: [err.message] });
      }
      if (err.message === "UNSUPPORTED_FILE_TYPE") {
        return res.status(400).json({
          error: "Validation failed",
          details: [`Allowed image types: ${ALLOWED_MIME_TYPES.join(", ")}`],
        });
      }
      return res.status(400).json({ error: "Validation failed", details: [err.message] });
    }

    const files = req.files || [];

    if (files.length < MIN_IMAGES) {
      return res.status(400).json({
        error: "Validation failed",
        details: [`You must upload at least ${MIN_IMAGES} images (received ${files.length})`],
      });
    }

    try {
      // Compress all images in parallel, then save
      const compressed = await Promise.all(
        files.map((f) => compressAndSave(f.buffer))
      );

      const newImages = compressed.map((c, i) => ({
        id: path.parse(c.filename).name,
        url: `/uploads/${c.filename}`,
        originalName: files[i].originalname,
        size: c.size, // compressed size, not original
      }));

      product.images.push(...newImages);
      product.updatedAt = new Date().toISOString();

      res.status(201).json(withComputedFields(product));
    } catch (compressionErr) {
      console.error("Image compression error:", compressionErr);
      res.status(400).json({
        error: "Validation failed",
        details: ["One or more files could not be processed as images"],
      });
    }
  });
});

// GET /api/products/:productId/images
app.get("/api/products/:productId/images", (req, res) => {
  const product = getProductOr404(req, res);
  if (!product) return;
  res.status(200).json(product.images);
});

// DELETE /api/products/:productId/images/:imageId
app.delete("/api/products/:productId/images/:imageId", (req, res) => {
  const product = getProductOr404(req, res);
  if (!product) return;

  const idx = product.images.findIndex((img) => img.id === req.params.imageId);
  if (idx === -1) {
    return res.status(404).json({ error: "Image not found" });
  }

  const [removed] = product.images.splice(idx, 1);
  fs.unlink(path.join(UPLOAD_DIR, path.basename(removed.url)), () => {});
  product.updatedAt = new Date().toISOString();

  res.status(204).send();
});

// ---------- Root ----------
app.get("/", (req, res) => {
  res.redirect("/api-docs");
});

// ---------- 404 fallback ----------
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ---------- Global error handler ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Product API running at http://localhost:${PORT}`);
  console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
});
