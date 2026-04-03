const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const os = require("os");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const xlsx = require("xlsx");

const app = express();
const DEFAULT_PORT = 3000;

// 配置文件上传
const upload = multer({ 
  dest: "uploads/",
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});

function resolveWritableDir(preferredDir, fallbackDir) {
  try {
    fs.mkdirSync(preferredDir, { recursive: true });
    const testFile = path.join(preferredDir, ".write-test");
    fs.writeFileSync(testFile, "1");
    fs.unlinkSync(testFile);
    return preferredDir;
  } catch {
    fs.mkdirSync(fallbackDir, { recursive: true });
    return fallbackDir;
  }
}

const isPackaged = !!process.pkg;
const runtimeBaseDir = isPackaged
  ? resolveWritableDir(
      path.dirname(process.execPath),
      path.join(os.homedir(), ".tobacco-price-desktop"),
    )
  : __dirname;

function ensureRuntimeAsset(relativePath) {
  const targetPath = path.join(runtimeBaseDir, relativePath);
  if (!isPackaged) return targetPath;
  if (fs.existsSync(targetPath)) return targetPath;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const sourcePath = path.join(__dirname, relativePath);
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

const runtimeIndexHtmlPath = ensureRuntimeAsset(path.join("src", "index.html"));
const runtimeSrcDir = path.dirname(runtimeIndexHtmlPath);

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 数据库连接
const dbPath = ensureRuntimeAsset("tobacco.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("无法连接数据库:", err);
  } else {
    console.log("数据库连接成功:", dbPath);
  }
});

// 静态文件服务
app.use(express.static(runtimeSrcDir));

// 主页面路由
app.get("/", (req, res) => {
  res.sendFile(runtimeIndexHtmlPath);
});

// API: 获取所有产品
app.get("/api/products", (req, res) => {
  db.all(`SELECT * FROM products ORDER BY id`, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// API: 获取产品的价格历史
app.get("/api/products/:id/history", (req, res) => {
  const productId = req.params.id;
  db.all(
    `SELECT * FROM price_history WHERE product_id = ? ORDER BY date`,
    [productId],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    },
  );
});

// API: 获取所有产品及其价格历史（优化版）
app.get("/api/products-with-history", (req, res) => {
  db.all(`SELECT * FROM products ORDER BY id`, [], (err, products) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    // 获取所有价格历史
    db.all(
      `SELECT * FROM price_history ORDER BY product_id, date`,
      [],
      (err, historyRecords) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }

        // 将价格历史按 product_id 分组
        const historyMap = {};
        historyRecords.forEach((record) => {
          if (!historyMap[record.product_id]) {
            historyMap[record.product_id] = [];
          }
          historyMap[record.product_id].push(record);
        });

        // 为每个产品添加价格历史
        const productsWithHistory = products.map((product) => ({
          ...product,
          price_history: historyMap[product.id] || [],
        }));

        res.json(productsWithHistory);
      },
    );
  });
});

// API: 添加新产品
app.post("/api/products", (req, res) => {
  const { brand, product_name, wholesale_price, retail_price, date, brand_id } =
    req.body;

  if (!brand || !product_name || !wholesale_price || !retail_price) {
    res.status(400).json({ error: "所有字段都是必填的" });
    return;
  }

  // 先检查是否存在相同品牌和产品名称的数据
  db.get(
    "SELECT id, brand_id FROM products WHERE brand = ? AND product_name = ?",
    [brand, product_name],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      const historyDate = date || new Date().toISOString().split("T")[0];

      // 如果品牌已存在，获取其 brand_id；如果不存在，获取最大 brand_id 并 +1
      const getBrandId = (callback) => {
        if (brand_id !== undefined && brand_id !== null) {
          callback(brand_id);
          return;
        }
        db.get(
          "SELECT brand_id FROM products WHERE brand = ?",
          [brand],
          (err, brandRow) => {
            if (err) {
              callback(1);
              return;
            }
            if (brandRow) {
              callback(brandRow.brand_id);
              return;
            }
            // 品牌不存在，获取最大 brand_id 并 +1
            db.get(
              "SELECT MAX(brand_id) as maxId FROM products",
              [],
              (err, result) => {
                if (err || !result || result.maxId === null) {
                  callback(1);
                } else {
                  callback(result.maxId + 1);
                }
              },
            );
          },
        );
      };

      if (row) {
        // 如果存在，则更新价格
        const productId = row.id;
        getBrandId((newBrandId) => {
          const updateSql = `UPDATE products SET wholesale_price = ?, retail_price = ?, brand_id = ? WHERE id = ?`;
          db.run(
            updateSql,
            [wholesale_price, retail_price, newBrandId, productId],
            (err) => {
              if (err) {
                res.status(500).json({ error: err.message });
                return;
              }

              // 同时更新或插入指定日期的价格历史
              db.get(
                "SELECT id FROM price_history WHERE product_id = ? AND date = ?",
                [productId, historyDate],
                (err, historyRow) => {
                  if (err) {
                    console.error("查询价格历史记录失败:", err);
                    res.json({
                      message: "产品价格已更新，但历史记录同步失败",
                      id: productId,
                      brand,
                      product_name,
                      wholesale_price,
                      retail_price,
                      brand_id: newBrandId,
                    });
                    return;
                  }

                  if (historyRow) {
                    // 如果当天已有记录，则覆盖更新
                    const updateHistorySql = `UPDATE price_history SET retail_price = ?, wholesale_price = ? WHERE id = ?`;
                    db.run(
                      updateHistorySql,
                      [retail_price, wholesale_price, historyRow.id],
                      (err) => {
                        if (err) console.error("无法更新价格历史记录:", err);
                        res.json({
                          message: "产品价格及今日历史记录已更新",
                          id: productId,
                          brand,
                          product_name,
                          wholesale_price,
                          retail_price,
                          brand_id: newBrandId,
                        });
                      },
                    );
                  } else {
                    // 插入新记录
                    const insertHistorySql = `INSERT INTO price_history (product_id, date, retail_price, wholesale_price) VALUES (?, ?, ?, ?)`;
                    db.run(
                      insertHistorySql,
                      [productId, historyDate, retail_price, wholesale_price],
                      (err) => {
                        if (err) console.error("无法插入价格历史记录:", err);
                        res.json({
                          message: "产品价格已更新，并添加了今日历史记录",
                          id: productId,
                          brand,
                          product_name,
                          wholesale_price,
                          retail_price,
                          brand_id: newBrandId,
                        });
                      },
                    );
                  }
                },
              );
            },
          );
        });
      } else {
        // 如果不存在，则插入新数据
        getBrandId((newBrandId) => {
          const sql = `INSERT INTO products (brand, product_name, wholesale_price, retail_price, brand_id, date) VALUES (?, ?, ?, ?, ?, ?)`;
          const params = [
            brand,
            product_name,
            wholesale_price,
            retail_price,
            newBrandId,
            historyDate,
          ];

          db.run(sql, params, function (err) {
            if (err) {
              res.status(500).json({ error: err.message });
              return;
            }

            const productId = this.lastID;
            // 新产品插入指定日期的历史记录
            const historySql = `INSERT INTO price_history (product_id, date, retail_price, wholesale_price) VALUES (?, ?, ?, ?)`;
            db.run(
              historySql,
              [productId, historyDate, retail_price, wholesale_price],
              (err) => {
                if (err) console.error("无法插入初始价格历史记录:", err);
                res.status(201).json({
                  id: productId,
                  brand,
                  product_name,
                  wholesale_price,
                  retail_price,
                  brand_id: newBrandId,
                });
              },
            );
          });
        });
      }
    },
  );
});

// API: 删除产品
app.delete("/api/products/:id", (req, res) => {
  const productId = req.params.id;

  // 先删除该产品的价格历史
  db.run(
    "DELETE FROM price_history WHERE product_id = ?",
    [productId],
    (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      // 再删除产品本身
      db.run("DELETE FROM products WHERE id = ?", [productId], (err) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ message: "产品已成功删除" });
      });
    },
  );
});

// API: 更新产品信息
app.patch("/api/products/:id", (req, res) => {
  const productId = req.params.id;
  const { brand, product_name, wholesale_price, retail_price, create_new_brand } = req.body;

  if (brand === undefined && product_name === undefined && wholesale_price === undefined && retail_price === undefined) {
    res.status(400).json({ error: "至少需要提供一个字段" });
    return;
  }

  // 如果 brand 变更，需要处理 brand_id
  if (brand !== undefined) {
    // 查询该 brand 是否已存在
    db.get(
      "SELECT brand_id FROM products WHERE brand = ? LIMIT 1",
      [brand],
      (err, row) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }

        if (row) {
          // 品牌已存在，使用现有的 brand_id
          updateProduct(row.brand_id);
        } else {
          // 品牌不存在，检查是否需要创建新品牌
          if (create_new_brand) {
            // 获取最大 brand_id 并 +1
            db.get(
              "SELECT MAX(brand_id) as maxId FROM products",
              [],
              (err, result) => {
                if (err) {
                  res.status(500).json({ error: err.message });
                  return;
                }
                const newBrandId = result && result.maxId ? result.maxId + 1 : 1;
                updateProduct(newBrandId);
              }
            );
          } else {
            // 返回提示，需要前端确认
            res.status(409).json({ 
              error: "NEW_BRAND_CONFIRM",
              message: `品牌 "${brand}" 不存在，是否创建为新品牌？`,
              brand: brand
            });
          }
        }
      }
    );
  } else {
    // 没有变更 brand，直接更新
    updateProduct(null);
  }

  function updateProduct(newBrandId) {
    const updates = [];
    const values = [];

    if (brand !== undefined) {
      updates.push("brand = ?");
      values.push(brand);
    }
    if (product_name !== undefined) {
      updates.push("product_name = ?");
      values.push(product_name);
    }
    if (wholesale_price !== undefined) {
      updates.push("wholesale_price = ?");
      values.push(wholesale_price);
    }
    if (retail_price !== undefined) {
      updates.push("retail_price = ?");
      values.push(retail_price);
    }
    if (newBrandId !== null) {
      updates.push("brand_id = ?");
      values.push(newBrandId);
    }

    values.push(productId);

    const sql = `UPDATE products SET ${updates.join(", ")} WHERE id = ?`;
    db.run(sql, values, function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ 
        message: "产品信息已更新",
        brand_id: newBrandId
      });
    });
  }
});

// API: 添加价格历史记录
app.post("/api/price-history", (req, res) => {
  const { product_id, date, wholesale_price, retail_price } = req.body;

  if (!product_id || !date || !wholesale_price || !retail_price) {
    res.status(400).json({ error: "所有字段都是必填的" });
    return;
  }

  const sql = `INSERT INTO price_history (product_id, date, wholesale_price, retail_price) VALUES (?, ?, ?, ?)`;
  const params = [product_id, date, wholesale_price, retail_price];

  db.run(sql, params, function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(201).json({
      id: this.lastID,
      product_id,
      date,
      wholesale_price,
      retail_price,
    });
  });
});

// API: 删除价格历史记录
app.delete("/api/price-history/:id", (req, res) => {
  const historyId = req.params.id;

  db.run("DELETE FROM price_history WHERE id = ?", [historyId], (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: "历史记录已成功删除" });
  });
});

// API: 批量导入产品数据
app.post("/api/import-products", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "请上传文件" });
    return;
  }

  const filePath = req.file.path;
  let successCount = 0;
  let failedCount = 0;
  const failedRows = [];

  try {
    // 读取 Excel 或 CSV 文件
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      fs.unlinkSync(filePath);
      res.status(400).json({ error: "文件为空" });
      return;
    }

    // 验证必需字段
    const requiredFields = [
      "id",
      "brand",
      "product_name",
      "wholesale_price",
      "retail_price",
    ];
    const firstRow = data[0];
    const missingFields = requiredFields.filter(
      (field) => !(field in firstRow),
    );

    if (missingFields.length > 0) {
      fs.unlinkSync(filePath);
      res
        .status(400)
        .json({ error: `文件缺少必需字段：${missingFields.join(", ")}` });
      return;
    }

    // 逐条处理数据
    const processRow = (index) => {
      if (index >= data.length) {
        // 所有数据处理完成
        fs.unlinkSync(filePath);
        res.json({
          success: successCount,
          failed: failedCount,
          failedRows: failedRows.slice(0, 10), // 只返回前 10 条失败记录
        });
        return;
      }

      const row = data[index];
      const {
        id,
        brand,
        product_name,
        wholesale_price,
        retail_price,
        brand_id,
        date,
      } = row;

      // 如果没有 id，跳过该行
      if (!id) {
        failedCount++;
        failedRows.push({ row: index + 1, reason: "缺少 id 字段" });
        processRow(index + 1);
        return;
      }

      // 检查必需字段是否为空
      if (
        !brand ||
        !product_name ||
        wholesale_price === undefined ||
        retail_price === undefined
      ) {
        failedCount++;
        failedRows.push({
          row: index + 1,
          reason:
            "缺少必需字段（brand/product_name/wholesale_price/retail_price）",
        });
        processRow(index + 1);
        return;
      }

      // 先检查 id 是否存在
      db.get(
        "SELECT id, product_name FROM products WHERE id = ?",
        [id],
        (err, existingProduct) => {
          if (err) {
            failedCount++;
            failedRows.push({
              row: index + 1,
              reason: `数据库错误：${err.message}`,
            });
            processRow(index + 1);
            return;
          }

          if (existingProduct) {
            // id 存在，检查 product_name 是否匹配
            if (existingProduct.product_name === product_name) {
              // product_name 匹配，更新现有产品
              db.run(
                "UPDATE products SET brand = ?, product_name = ?, wholesale_price = ?, retail_price = ?, brand_id = ?, date = ? WHERE id = ?",
                [
                  brand,
                  product_name,
                  wholesale_price,
                  retail_price,
                  brand_id || null,
                  date || null,
                  id,
                ],
                (err) => {
                  if (err) {
                    failedCount++;
                    failedRows.push({
                      row: index + 1,
                      reason: `更新失败：${err.message}`,
                    });
                  } else {
                    successCount++;
                  }
                  processRow(index + 1);
                },
              );
            } else {
              // id 存在但 product_name 不匹配，报错
              failedCount++;
              failedRows.push({
                row: index + 1,
                reason: `id 存在但 product_name 不匹配（数据库中为"${existingProduct.product_name}"）`,
              });
              processRow(index + 1);
            }
          } else {
            // id 不存在，插入新产品
            db.run(
              "INSERT INTO products (id, brand, product_name, wholesale_price, retail_price, brand_id, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [
                id,
                brand,
                product_name,
                wholesale_price,
                retail_price,
                brand_id || null,
                date || null,
              ],
              function (err) {
                if (err) {
                  failedCount++;
                  failedRows.push({
                    row: index + 1,
                    reason: `插入失败：${err.message}`,
                  });
                } else {
                  successCount++;
                }
                processRow(index + 1);
              },
            );
          }
        },
      );
    };

    // 开始处理第一行
    processRow(0);
  } catch (error) {
    fs.unlinkSync(filePath);
    res.status(500).json({ error: `处理文件失败：${error.message}` });
  }
});

// API: 批量导入价格历史
app.post("/api/import-price-history", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "请上传文件" });
    return;
  }

  const filePath = req.file.path;
  let successCount = 0;
  let failedCount = 0;
  const failedRows = [];

  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      fs.unlinkSync(filePath);
      res.status(400).json({ error: "文件为空" });
      return;
    }

    // 验证必需字段
    const requiredFields = [
      "product_name",
      "wholesale_price",
      "retail_price",
      "date",
    ];
    const firstRow = data[0];
    const missingFields = requiredFields.filter(
      (field) => !(field in firstRow),
    );

    if (missingFields.length > 0) {
      fs.unlinkSync(filePath);
      res
        .status(400)
        .json({ error: `文件缺少必需字段：${missingFields.join(", ")}` });
      return;
    }

    // 逐条处理数据
    const processRow = (index) => {
      if (index >= data.length) {
        fs.unlinkSync(filePath);
        res.json({
          success: successCount,
          failed: failedCount,
          failedRows: failedRows.slice(0, 10),
        });
        return;
      }

      const row = data[index];
      const { product_name, wholesale_price, retail_price, date } = row;

      // 检查必需字段是否为空
      if (
        !product_name ||
        wholesale_price === undefined ||
        retail_price === undefined ||
        !date
      ) {
        failedCount++;
        failedRows.push({
          row: index + 1,
          reason:
            "缺少必需字段（product_name/wholesale_price/retail_price/date）",
        });
        processRow(index + 1);
        return;
      }

      // 根据 product_name 查找产品ID
      db.get(
        "SELECT id FROM products WHERE product_name = ?",
        [product_name],
        (err, product) => {
          if (err) {
            failedCount++;
            failedRows.push({
              row: index + 1,
              reason: `数据库错误：${err.message}`,
            });
            processRow(index + 1);
            return;
          }

          if (!product) {
            failedCount++;
            failedRows.push({
              row: index + 1,
              reason: `找不到产品：${product_name}`,
            });
            processRow(index + 1);
            return;
          }

          // 插入价格历史
          db.run(
            "INSERT INTO price_history (product_id, date, wholesale_price, retail_price) VALUES (?, ?, ?, ?)",
            [product.id, date, wholesale_price, retail_price],
            (err) => {
              if (err) {
                failedCount++;
                failedRows.push({
                  row: index + 1,
                  reason: `插入失败：${err.message}`,
                });
              } else {
                successCount++;
              }
              processRow(index + 1);
            },
          );
        },
      );
    };

    processRow(0);
  } catch (error) {
    fs.unlinkSync(filePath);
    res.status(500).json({ error: `处理文件失败：${error.message}` });
  }
});

// 启动服务器
function openBrowser(port) {
  const url = `http://localhost:${port}`;

  let browserCommand;
  const platform = os.platform();
  switch (platform) {
    case "win32":
      browserCommand = `start ${url}`;
      break;
    case "darwin":
      browserCommand = `open ${url}`;
      break;
    case "linux":
      browserCommand = `xdg-open ${url}`;
      break;
    default:
      console.log(`请手动打开浏览器访问: ${url}`);
      return;
  }

  exec(browserCommand, (err) => {
    if (err) {
      console.error("无法自动打开浏览器:", err);
      console.log(`请手动打开浏览器访问: ${url}`);
    }
  });
}

// API: 备份数据库
app.post("/api/backup", (req, res) => {
  try {
    const dbPath = path.join(runtimeBaseDir, "tobacco.db");
    const backupDir = path.join(runtimeBaseDir, "backup");
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const backupFileName = `tobacco_backup_${year}-${month}-${day}_${hours}${minutes}${seconds}.db`;
    const backupPath = path.join(backupDir, backupFileName);
    
    fs.copyFileSync(dbPath, backupPath);
    
    res.json({ 
      success: true, 
      backupFile: backupFileName,
      message: "数据库备份成功"
    });
  } catch (error) {
    console.error("备份数据库失败:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// API: 恢复数据库
app.post("/api/restore", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "请上传备份文件" });
    return;
  }

  const uploadedFilePath = req.file.path;
  const dbPath = path.join(runtimeBaseDir, "tobacco.db");
  const backupDir = path.join(runtimeBaseDir, "backup");
  let backupFileName = "";

  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    backupFileName = `tobacco_backup_${year}-${month}-${day}_${hours}${minutes}${seconds}.db`;
    const backupPath = path.join(backupDir, backupFileName);

    fs.copyFileSync(dbPath, backupPath);

    const restoreDb = new sqlite3.Database(uploadedFilePath);
    const currentDb = new sqlite3.Database(dbPath);

    let productsCount = 0;
    let historyCount = 0;

    const clearTables = () => {
      return new Promise((resolve, reject) => {
        currentDb.serialize(() => {
          currentDb.run("DELETE FROM price_history", (err) => {
            if (err) return reject(err);
            currentDb.run("DELETE FROM products", (err) => {
              if (err) return reject(err);
              resolve();
            });
          });
        });
      });
    };

    const restoreProducts = () => {
      return new Promise((resolve, reject) => {
        restoreDb.all("SELECT * FROM products", (err, products) => {
          if (err) return reject(err);

          const insertProduct = currentDb.prepare(
            "INSERT INTO products (id, brand, product_name, wholesale_price, retail_price, brand_id, date) VALUES (?, ?, ?, ?, ?, ?, ?)"
          );

          products.forEach((product) => {
            insertProduct.run(
              product.id,
              product.brand,
              product.product_name,
              product.wholesale_price,
              product.retail_price,
              product.brand_id,
              product.date
            );
            productsCount++;
          });
          insertProduct.finalize();
          resolve();
        });
      });
    };

    const restoreHistory = () => {
      return new Promise((resolve, reject) => {
        restoreDb.all("SELECT * FROM price_history", (err, histories) => {
          if (err) return reject(err);

          const insertHistory = currentDb.prepare(
            "INSERT INTO price_history (id, product_id, wholesale_price, retail_price, date) VALUES (?, ?, ?, ?, ?)"
          );

          histories.forEach((history) => {
            insertHistory.run(
              history.id,
              history.product_id,
              history.wholesale_price,
              history.retail_price,
              history.date
            );
            historyCount++;
          });
          insertHistory.finalize();
          resolve();
        });
      });
    };

    await clearTables();
    await restoreProducts();
    await restoreHistory();

    await new Promise((resolve, reject) => {
      restoreDb.close((err) => {
        if (err) {
          console.error("关闭恢复数据库失败:", err);
          reject(err);
          return;
        }
        resolve();
      });
    });

    await new Promise((resolve, reject) => {
      currentDb.close((err) => {
        if (err) {
          console.error("关闭当前数据库失败:", err);
          reject(err);
          return;
        }
        resolve();
      });
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    try {
      fs.unlinkSync(uploadedFilePath);
    } catch (unlinkErr) {
      console.error("删除临时文件失败:", unlinkErr);
    }

    res.json({
      success: true,
      backupFile: backupFileName,
      productsCount: productsCount,
      historyCount: historyCount,
      message: "数据恢复成功"
    });
  } catch (error) {
    console.error("恢复数据库失败:", error);
    if (fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath);
    }
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

function startServer(preferredPort) {
  const server = app.listen(preferredPort, () => {
    const address = server.address();
    const port =
      typeof address === "object" && address ? address.port : preferredPort;
    console.log(`烟草价格查询系统已启动，访问地址: http://localhost:${port}`);
    openBrowser(port);
  });

  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      startServer(0);
      return;
    }
    console.error("服务器启动失败:", err);
    process.exit(1);
  });

  return server;
}

const preferredPort = Number(process.env.PORT) || DEFAULT_PORT;
startServer(preferredPort);

// 优雅关闭
process.on("SIGINT", () => {
  console.log("\n正在关闭服务器...");
  process.exit(0);
});
