const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const AsyncErrorHandler = require("../Utils/AsyncErrorHandler");
const Food = require("../Models/FoodSchema");

// ======================
// CREATE FOOD (WITH IMAGE UPLOAD)
// ======================
exports.createFood = AsyncErrorHandler(async (req, res) => {
    const {
        name,
        description,
        category,
        price,
        stock,
        status,
    } = req.body;

    console.log("TRigger!!");

    // Validate required fields
    if (!name || !price) {
        return res.status(400).json({
            status: "fail",
            message: "Name and price are required.",
        });
    }

    let avatar = { url: "", public_id: "" };

    // ============================================
    // IMAGE UPLOAD SA UPLOADAGTA
    // ============================================
    if (req.file) {
        console.log("📸 Uploading image to UPLOADAGTA...");
        console.log("📁 File:", {
            originalname: req.file.originalname,
            size: `${(req.file.size / 1024).toFixed(2)} KB`,
            mimetype: req.file.mimetype,
            path: req.file.path,
        });

        const form = new FormData();
        form.append("file", fs.createReadStream(req.file.path), req.file.originalname);

        try {
            const response = await axios.post(process.env.UPLOADAGTA_URL, form, {
                maxBodyLength: Infinity,
                headers: { ...form.getHeaders() },
            });

            console.log("📤 Upload Response:", response.data);

            if (response.data && response.data.url) {
                avatar = {
                    url: response.data.url,
                    public_id: response.data.public_id || response.data.filename || req.file.filename,
                };
                console.log("✅ Image uploaded successfully:", avatar);
            } else if (response.data && response.data.success && response.data.data) {
                avatar = {
                    url: response.data.data.url,
                    public_id: response.data.data.public_id || req.file.filename,
                };
                console.log("✅ Image uploaded successfully:", avatar);
            } else if (response.data && response.data.file) {
                avatar = {
                    url: response.data.file,
                    public_id: req.file.filename,
                };
                console.log("✅ Image uploaded successfully:", avatar);
            } else {
                console.log("⚠️ Unexpected response format:", response.data);
                avatar = {
                    url: `/temp-uploads/${req.file.filename}`,
                    public_id: req.file.filename,
                };
            }

            // Delete temporary file after upload
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
                console.log("🗑️ Temporary file deleted:", req.file.path);
            }
        } catch (err) {
            console.error("❌ Upload Error:", err.message);

            // Delete temporary file kahit nag-error
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
        }
    } else {
        console.log("ℹ️ No image file provided, using default.");
    }

    // ============================================
    // CREATE FOOD DOCUMENT
    // ============================================
    const foodData = {
        name,
        description: description || "",
        category: category || "General",
        price: Number(price),
        stock: stock ? Number(stock) : undefined,
        status: status || "available",
        avatar,
    };

    console.log("📝 Creating food with payload:", JSON.stringify(foodData, null, 2));

    const newFood = await Food.create(foodData);

    res.status(201).json({
        status: "success",
        message: "Food created successfully.",
        data: newFood,
    });
});

// controllers/foodController.js

exports.DisplayFood = AsyncErrorHandler(async (req, res) => {
    // ─── 1. Extract & sanitize query params ─────────────────────────
    const {
        search = "",
        page = 1,
        limit = 10,
        category,      // ← CATEGORY FILTER
        status,
        sortBy = "createdAt",
        sortOrder = "desc",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    // ─── 2. Build $match stage ──────────────────────────────────────
    const matchStage = {};

    // Search sa name (case-insensitive, escaped regex)
    if (search.trim()) {
        const escaped = search
            .trim()
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        matchStage.name = { $regex: escaped, $options: "i" };
    }

    // ─── CATEGORY FILTER ────────────────────────────────────────────
    // Support both single category at multiple categories (comma-separated)
    if (category && category.trim()) {
        const categoryList = category
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);

        if (categoryList.length === 1) {
            matchStage.category = categoryList[0];
        } else if (categoryList.length > 1) {
            matchStage.category = { $in: categoryList };
        }
    }

    // Status filter
    if (status && status.trim()) matchStage.status = status.trim();

    // ─── 3. Build $sort stage ───────────────────────────────────────
    const allowedSortFields = [
        "createdAt",
        "updatedAt",
        "name",
        "price",
    ];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDir = sortOrder === "asc" ? 1 : -1;

    // ─── 4. Execute data + count + categories in parallel ──────────
    const [results, categories] = await Promise.all([
        Food.aggregate([
            { $match: matchStage },
            { $sort: { [sortField]: sortDir } },
            {
                $facet: {
                    data: [
                        { $skip: skip },
                        { $limit: limitNum },
                    ],
                    totalCount: [{ $count: "count" }],
                },
            },
        ]),
        // Kunin ang unique categories (para sa filter dropdown)
        Food.distinct("category"),
    ]);

    const data = results[0]?.data || [];
    const totalFood = results[0]?.totalCount[0]?.count || 0;

    // ─── 5. Response ────────────────────────────────────────────────
    res.status(200).json({
        status: "success",
        data,
        totalFood,
        totalRecords: totalFood,
        currentPage: pageNum,
        totalPages: Math.ceil(totalFood / limitNum),
        limit: limitNum,
        count: data.length,
        categories, // ← listahan ng categories para sa dropdown

        // Optional: ipakita ang active filter para sa frontend
        appliedFilters: {
            search: search.trim() || null,
            category: category?.trim() || null,
            status: status?.trim() || null,
        },
    });
});
// ======================
// UPDATE FOOD (WITH DELETE OLD IMAGE)
// ======================
exports.UpdateFood = AsyncErrorHandler(async (req, res) => {
    const foodID = req.params.id;

    // Check if food exists
    const existingFood = await Food.findById(foodID);
    if (!existingFood) {
        return res.status(404).json({
            status: "fail",
            message: "Food not found.",
        });
    }

    let avatar = existingFood.avatar;

    // ============================================
    // IMAGE UPLOAD (KUNG MAY BAGONG IMAGE)
    // ============================================
    if (req.file) {
        console.log("📸 Uploading new image to UPLOADAGTA...");
        console.log("📁 File:", {
            originalname: req.file.originalname,
            size: `${(req.file.size / 1024).toFixed(2)} KB`,
            mimetype: req.file.mimetype,
            path: req.file.path,
        });

        const form = new FormData();
        form.append("file", fs.createReadStream(req.file.path), req.file.originalname);

        try {
            const response = await axios.post(process.env.UPLOADAGTA_URL, form, {
                maxBodyLength: Infinity,
                headers: { ...form.getHeaders() },
            });

            console.log("📤 Upload Response:", response.data);

            if (response.data && (response.data.url || response.data.success)) {
                // ============================================
                // DELETE OLD IMAGE (GAMIT ANG FULL URL)
                // ============================================
                if (existingFood.avatar?.public_id &&
                    existingFood.avatar.public_id !== "default_food_image" &&
                    existingFood.avatar?.url) {

                    console.log("🗑️ Deleting old image...");
                    console.log("📁 Old Public ID:", existingFood.avatar.public_id);
                    console.log("🔗 Old Image URL:", existingFood.avatar.url);

                    await deleteImageFromServer(
                        existingFood.avatar.public_id,
                        existingFood.avatar.url  // ← FULL URL ng lumang image
                    );
                }

                avatar = {
                    url: response.data.url || response.data.data?.url,
                    public_id: response.data.public_id ||
                        response.data.data?.public_id ||
                        response.data.filename ||
                        req.file.filename,
                };

                console.log("✅ New image uploaded successfully:", avatar);
            }

            // Delete temporary file
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
                console.log("🗑️ Temporary file deleted:", req.file.path);
            }
        } catch (err) {
            console.error("❌ Upload Error:", err.message);

            // Delete temporary file kahit nag-error
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
        }
    } else {
        // Kung may avatar object sa req.body
        if (req.body.avatar) {
            try {
                avatar = typeof req.body.avatar === "string"
                    ? JSON.parse(req.body.avatar)
                    : req.body.avatar;
            } catch (e) {
                avatar = existingFood.avatar;
            }
        }
        console.log("ℹ️ No new image, keeping existing avatar.");
    }

    // ============================================
    // UPDATE FOOD DOCUMENT
    // ============================================
    const updateData = {
        name: req.body.name || existingFood.name,
        description: req.body.description !== undefined ? req.body.description : existingFood.description,
        category: req.body.category || existingFood.category,
        price: req.body.price !== undefined ? Number(req.body.price) : existingFood.price,
        stock: req.body.stock !== undefined ? Number(req.body.stock) : existingFood.stock,
        status: req.body.status || existingFood.status,
        avatar,
    };

    console.log("📝 Updating food with payload:", JSON.stringify(updateData, null, 2));

    const updateFood = await Food.findByIdAndUpdate(foodID, updateData, {
        new: true,
        runValidators: true,
    });

    res.status(200).json({
        status: "success",
        message: "Food updated successfully.",
        data: updateFood,
    });
});

// ======================
// DELETE FOOD (WITH DELETE IMAGE FROM SERVER)
// ======================
exports.deleteFood = AsyncErrorHandler(async (req, res) => {
    const foodID = req.params.id;

    const existingFood = await Food.findById(foodID);

    if (!existingFood) {
        return res.status(404).json({
            status: "fail",
            message: "Food not found.",
        });
    }

    // ============================================
    // DELETE IMAGE FROM SERVER (GAMIT ANG FULL URL)
    // ============================================
    if (existingFood.avatar?.public_id &&
        existingFood.avatar.public_id !== "default_food_image" &&
        existingFood.avatar?.url) {

        console.log("🗑️ Deleting image from server...");
        console.log("📁 Public ID:", existingFood.avatar.public_id);
        console.log("🔗 Image URL:", existingFood.avatar.url);

        await deleteImageFromServer(
            existingFood.avatar.public_id,
            existingFood.avatar.url  // ← FULL URL ng image
        );
    }

    // Delete food from database
    await Food.findByIdAndDelete(foodID);

    console.log("🗑️ Food deleted:", foodID);

    res.status(200).json({
        status: "success",
        message: "Food deleted successfully.",
    });
});

// ======================
// GET SINGLE FOOD
// ======================
exports.GetSingleFood = AsyncErrorHandler(async (req, res) => {
    const food = await Food.findById(req.params.id);

    if (!food) {
        return res.status(404).json({
            status: "fail",
            message: "Food not found.",
        });
    }

    res.status(200).json({
        status: "success",
        data: food,
    });
});

// ============================================
// HELPER FUNCTION: Delete Image from PHP Server
// Ipinapasa ang FULL URL sa deleteagta.php
// ============================================
const deleteImageFromServer = async (publicId, imageUrl) => {
    try {
        // Huwag i-delete kung walang public_id o default image
        if (!publicId || publicId === "default_food_image") {
            console.log("ℹ️ Skipping delete - no valid public_id");
            return { success: true, message: "Skipped - no public_id" };
        }

        const removeUrl = process.env.REMOVE_URL;

        if (!removeUrl) {
            console.error("❌ REMOVE_URL is not defined in .env file!");
            return { success: false, message: "REMOVE_URL not configured" };
        }

        // Kunin ang full URL - gamitin ang imageUrl parameter
        // Kung walang imageUrl, subukan i-construct
        let fileUrl = imageUrl;

        if (!fileUrl) {
            // Fallback: construct URL from public_id
            fileUrl = `https://lightgreen-cheetah-662664.hostingersite.com/uploads/${publicId}`;
            console.log("⚠️ No imageUrl provided, using constructed URL:", fileUrl);
        }

        console.log("🔗 Deleting from:", removeUrl);
        console.log("📁 File URL:", fileUrl);

        // I-send ang FULL URL bilang 'file' parameter (tulad ng ineexpect ng PHP)
        const formData = new FormData();
        formData.append("file", fileUrl);

        const response = await axios.post(removeUrl, formData, {
            headers: {
                ...formData.getHeaders(),
            },
            timeout: 10000,
        });

        console.log("📤 Delete Response:", response.data);

        if (response.data && response.data.success) {
            console.log("✅ Image deleted successfully:", publicId);
            return response.data;
        } else {
            console.log("⚠️ Delete failed:", response.data.message);
            return response.data;
        }
    } catch (err) {
        console.error("❌ Failed to delete image:", err.message);
        if (err.response) {
            console.error("❌ Response Status:", err.response.status);
            console.error("❌ Response Data:", err.response.data);
        }
        // Hindi i-throw ang error para hindi ma-block ang delete operation
        return { success: false, message: err.message };
    }
};