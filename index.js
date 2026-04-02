const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const os = require("os");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const DEFAULT_PORT = 3000;

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
  const { brand, product_name, wholesale_price, retail_price, date } = req.body;

  if (!brand || !product_name || !wholesale_price || !retail_price) {
    res.status(400).json({ error: "所有字段都是必填的" });
    return;
  }

  // 先检查是否存在相同品牌和产品名称的数据
  db.get(
    "SELECT id FROM products WHERE brand = ? AND product_name = ?",
    [brand, product_name],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      const historyDate = date || new Date().toISOString().split("T")[0];

      if (row) {
        // 如果存在，则更新价格
        const productId = row.id;
        const updateSql = `UPDATE products SET wholesale_price = ?, retail_price = ? WHERE id = ?`;
        db.run(updateSql, [wholesale_price, retail_price, productId], (err) => {
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
                    });
                  },
                );
              }
            },
          );
        });
      } else {
        // 如果不存在，则插入新数据
        const sql = `INSERT INTO products (brand, product_name, wholesale_price, retail_price) VALUES (?, ?, ?, ?)`;
        const params = [brand, product_name, wholesale_price, retail_price];

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
              });
            },
          );
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

// API: 更新产品价格
app.patch("/api/products/:id", (req, res) => {
  const productId = req.params.id;
  const { wholesale_price, retail_price } = req.body;

  if (wholesale_price === undefined && retail_price === undefined) {
    res.status(400).json({ error: "至少需要提供一个价格字段" });
    return;
  }

  const updates = [];
  const values = [];

  if (wholesale_price !== undefined) {
    updates.push("wholesale_price = ?");
    values.push(wholesale_price);
  }
  if (retail_price !== undefined) {
    updates.push("retail_price = ?");
    values.push(retail_price);
  }

  values.push(productId);

  const sql = `UPDATE products SET ${updates.join(", ")} WHERE id = ?`;
  db.run(sql, values, function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: "产品价格已更新" });
  });
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
