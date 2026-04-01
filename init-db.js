const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 创建数据库连接
const dbPath = path.join(__dirname, 'tobacco.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('无法创建数据库:', err);
        return;
    }
    console.log('数据库创建成功:', dbPath);
    initDatabase();
});

// 初始化数据库表
function initDatabase() {
    // 创建产品表
    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand TEXT NOT NULL,
            product_name TEXT NOT NULL,
            wholesale_price REAL NOT NULL,
            retail_price REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('创建产品表失败:', err);
            return;
        }
        console.log('产品表创建成功');
        
        // 创建价格历史表
        db.run(`
            CREATE TABLE IF NOT EXISTS price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                retail_price REAL NOT NULL,
                wholesale_price REAL NOT NULL,
                FOREIGN KEY (product_id) REFERENCES products(id),
                UNIQUE(product_id, date)
            )
        `, (err) => {
            if (err) {
                console.error('创建价格历史表失败:', err);
                return;
            }
            console.log('价格历史表创建成功');
            insertData();
        });
    });
}

// 插入模拟数据
function insertData() {
    const tobaccoData = [
        {
            brand: "中华",
            productName: "软中华",
            wholesalePrice: 550.0,
            retailPrice: 65.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 63.0, wholesalePrice: 530.0 },
                { date: "2024-02-01", retailPrice: 64.0, wholesalePrice: 540.0 },
                { date: "2024-03-01", retailPrice: 65.0, wholesalePrice: 550.0 },
            ],
        },
        {
            brand: "中华",
            productName: "硬中华",
            wholesalePrice: 450.0,
            retailPrice: 50.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 48.0, wholesalePrice: 430.0 },
                { date: "2024-02-01", retailPrice: 49.0, wholesalePrice: 440.0 },
                { date: "2024-03-01", retailPrice: 50.0, wholesalePrice: 450.0 },
            ],
        },
        {
            brand: "玉溪",
            productName: "软玉溪",
            wholesalePrice: 210.0,
            retailPrice: 23.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 22.0, wholesalePrice: 200.0 },
                { date: "2024-02-01", retailPrice: 22.5, wholesalePrice: 205.0 },
                { date: "2024-03-01", retailPrice: 23.0, wholesalePrice: 210.0 },
            ],
        },
        {
            brand: "玉溪",
            productName: "硬玉溪",
            wholesalePrice: 200.0,
            retailPrice: 22.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 21.0, wholesalePrice: 190.0 },
                { date: "2024-02-01", retailPrice: 21.5, wholesalePrice: 195.0 },
                { date: "2024-03-01", retailPrice: 22.0, wholesalePrice: 200.0 },
            ],
        },
        {
            brand: "云烟",
            productName: "软珍品云烟",
            wholesalePrice: 220.0,
            retailPrice: 25.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 24.0, wholesalePrice: 210.0 },
                { date: "2024-02-01", retailPrice: 24.5, wholesalePrice: 215.0 },
                { date: "2024-03-01", retailPrice: 25.0, wholesalePrice: 220.0 },
            ],
        },
        {
            brand: "云烟",
            productName: "硬珍品云烟",
            wholesalePrice: 210.0,
            retailPrice: 23.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 22.0, wholesalePrice: 200.0 },
                { date: "2024-02-01", retailPrice: 22.5, wholesalePrice: 205.0 },
                { date: "2024-03-01", retailPrice: 23.0, wholesalePrice: 210.0 },
            ],
        },
        {
            brand: "芙蓉王",
            productName: "硬芙蓉王",
            wholesalePrice: 230.0,
            retailPrice: 25.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 24.0, wholesalePrice: 220.0 },
                { date: "2024-02-01", retailPrice: 24.5, wholesalePrice: 225.0 },
                { date: "2024-03-01", retailPrice: 25.0, wholesalePrice: 230.0 },
            ],
        },
        {
            brand: "芙蓉王",
            productName: "软蓝芙蓉王",
            wholesalePrice: 500.0,
            retailPrice: 55.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 53.0, wholesalePrice: 480.0 },
                { date: "2024-02-01", retailPrice: 54.0, wholesalePrice: 490.0 },
                { date: "2024-03-01", retailPrice: 55.0, wholesalePrice: 500.0 },
            ],
        },
        {
            brand: "利群",
            productName: "新版利群",
            wholesalePrice: 135.0,
            retailPrice: 15.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 14.5, wholesalePrice: 130.0 },
                { date: "2024-02-01", retailPrice: 14.8, wholesalePrice: 132.0 },
                { date: "2024-03-01", retailPrice: 15.0, wholesalePrice: 135.0 },
            ],
        },
        {
            brand: "利群",
            productName: "软蓝利群",
            wholesalePrice: 180.0,
            retailPrice: 20.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 19.0, wholesalePrice: 170.0 },
                { date: "2024-02-01", retailPrice: 19.5, wholesalePrice: 175.0 },
                { date: "2024-03-01", retailPrice: 20.0, wholesalePrice: 180.0 },
            ],
        },
        {
            brand: "南京",
            productName: "南京九五之尊",
            wholesalePrice: 800.0,
            retailPrice: 100.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 95.0, wholesalePrice: 760.0 },
                { date: "2024-02-01", retailPrice: 98.0, wholesalePrice: 780.0 },
                { date: "2024-03-01", retailPrice: 100.0, wholesalePrice: 800.0 },
            ],
        },
        {
            brand: "南京",
            productName: "南京炫赫门",
            wholesalePrice: 140.0,
            retailPrice: 16.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 15.0, wholesalePrice: 130.0 },
                { date: "2024-02-01", retailPrice: 15.5, wholesalePrice: 135.0 },
                { date: "2024-03-01", retailPrice: 16.0, wholesalePrice: 140.0 },
            ],
        },
        {
            brand: "黄鹤楼",
            productName: "黄鹤楼 1916",
            wholesalePrice: 800.0,
            retailPrice: 100.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 95.0, wholesalePrice: 760.0 },
                { date: "2024-02-01", retailPrice: 98.0, wholesalePrice: 780.0 },
                { date: "2024-03-01", retailPrice: 100.0, wholesalePrice: 800.0 },
            ],
        },
        {
            brand: "黄鹤楼",
            productName: "软蓝黄鹤楼",
            wholesalePrice: 160.0,
            retailPrice: 18.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 17.0, wholesalePrice: 150.0 },
                { date: "2024-02-01", retailPrice: 17.5, wholesalePrice: 155.0 },
                { date: "2024-03-01", retailPrice: 18.0, wholesalePrice: 160.0 },
            ],
        },
        {
            brand: "苏烟",
            productName: "软金砂苏烟",
            wholesalePrice: 480.0,
            retailPrice: 50.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 48.0, wholesalePrice: 460.0 },
                { date: "2024-02-01", retailPrice: 49.0, wholesalePrice: 470.0 },
                { date: "2024-03-01", retailPrice: 50.0, wholesalePrice: 480.0 },
            ],
        },
        {
            brand: "苏烟",
            productName: "硬金砂苏烟",
            wholesalePrice: 450.0,
            retailPrice: 48.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 46.0, wholesalePrice: 430.0 },
                { date: "2024-02-01", retailPrice: 47.0, wholesalePrice: 440.0 },
                { date: "2024-03-01", retailPrice: 48.0, wholesalePrice: 450.0 },
            ],
        },
        {
            brand: "红塔山",
            productName: "经典 1956 红塔山",
            wholesalePrice: 75.0,
            retailPrice: 8.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 7.5, wholesalePrice: 70.0 },
                { date: "2024-02-01", retailPrice: 7.8, wholesalePrice: 72.0 },
                { date: "2024-03-01", retailPrice: 8.0, wholesalePrice: 75.0 },
            ],
        },
        {
            brand: "红塔山",
            productName: "经典 100 红塔山",
            wholesalePrice: 85.0,
            retailPrice: 10.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 9.5, wholesalePrice: 80.0 },
                { date: "2024-02-01", retailPrice: 9.8, wholesalePrice: 82.0 },
                { date: "2024-03-01", retailPrice: 10.0, wholesalePrice: 85.0 },
            ],
        },
        {
            brand: "白沙",
            productName: "精品二代白沙",
            wholesalePrice: 85.0,
            retailPrice: 10.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 9.5, wholesalePrice: 80.0 },
                { date: "2024-02-01", retailPrice: 9.8, wholesalePrice: 82.0 },
                { date: "2024-03-01", retailPrice: 10.0, wholesalePrice: 85.0 },
            ],
        },
        {
            brand: "白沙",
            productName: "软白沙",
            wholesalePrice: 42.0,
            retailPrice: 5.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 4.8, wholesalePrice: 40.0 },
                { date: "2024-02-01", retailPrice: 4.9, wholesalePrice: 41.0 },
                { date: "2024-03-01", retailPrice: 5.0, wholesalePrice: 42.0 },
            ],
        },
        {
            brand: "红河",
            productName: "硬甲红河",
            wholesalePrice: 45.0,
            retailPrice: 5.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 4.8, wholesalePrice: 43.0 },
                { date: "2024-02-01", retailPrice: 4.9, wholesalePrice: 44.0 },
                { date: "2024-03-01", retailPrice: 5.0, wholesalePrice: 45.0 },
            ],
        },
        {
            brand: "红河",
            productName: "软乙红河",
            wholesalePrice: 28.0,
            retailPrice: 3.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 2.8, wholesalePrice: 26.0 },
                { date: "2024-02-01", retailPrice: 2.9, wholesalePrice: 27.0 },
                { date: "2024-03-01", retailPrice: 3.0, wholesalePrice: 28.0 },
            ],
        },
        {
            brand: "红梅",
            productName: "硬黄红梅",
            wholesalePrice: 26.0,
            retailPrice: 3.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 2.8, wholesalePrice: 24.0 },
                { date: "2024-02-01", retailPrice: 2.9, wholesalePrice: 25.0 },
                { date: "2024-03-01", retailPrice: 3.0, wholesalePrice: 26.0 },
            ],
        },
        {
            brand: "红梅",
            productName: "软黄红梅",
            wholesalePrice: 24.0,
            retailPrice: 2.5,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 2.3, wholesalePrice: 22.0 },
                { date: "2024-02-01", retailPrice: 2.4, wholesalePrice: 23.0 },
                { date: "2024-03-01", retailPrice: 2.5, wholesalePrice: 24.0 },
            ],
        },
        {
            brand: "Marlboro",
            productName: "蓝 Marlboro",
            wholesalePrice: 160.0,
            retailPrice: 18.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 17.0, wholesalePrice: 150.0 },
                { date: "2024-02-01", retailPrice: 17.5, wholesalePrice: 155.0 },
                { date: "2024-03-01", retailPrice: 18.0, wholesalePrice: 160.0 },
            ],
        },
        {
            brand: "Camel",
            productName: "原味 Camel",
            wholesalePrice: 140.0,
            retailPrice: 15.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 14.0, wholesalePrice: 130.0 },
                { date: "2024-02-01", retailPrice: 14.5, wholesalePrice: 135.0 },
                { date: "2024-03-01", retailPrice: 15.0, wholesalePrice: 140.0 },
            ],
        },
        {
            brand: "Camel",
            productName: "蓝 Camel",
            wholesalePrice: 150.0,
            retailPrice: 16.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 15.0, wholesalePrice: 140.0 },
                { date: "2024-02-01", retailPrice: 15.5, wholesalePrice: 145.0 },
                { date: "2024-03-01", retailPrice: 16.0, wholesalePrice: 150.0 },
            ],
        },
        {
            brand: "Davidoff",
            productName: "经典 Davidoff",
            wholesalePrice: 280.0,
            retailPrice: 30.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 28.0, wholesalePrice: 260.0 },
                { date: "2024-02-01", retailPrice: 29.0, wholesalePrice: 270.0 },
                { date: "2024-03-01", retailPrice: 30.0, wholesalePrice: 280.0 },
            ],
        },
        {
            brand: "Davidoff",
            productName: "精选 Davidoff",
            wholesalePrice: 350.0,
            retailPrice: 40.0,
            priceHistory: [
                { date: "2024-01-01", retailPrice: 38.0, wholesalePrice: 330.0 },
                { date: "2024-02-01", retailPrice: 39.0, wholesalePrice: 340.0 },
                { date: "2024-03-01", retailPrice: 40.0, wholesalePrice: 350.0 },
            ],
        },
    ];

    let productCount = 0;
    const totalProducts = tobaccoData.length;

    tobaccoData.forEach((product) => {
        db.run(
            `INSERT INTO products (brand, product_name, wholesale_price, retail_price) VALUES (?, ?, ?, ?)`,
            [product.brand, product.productName, product.wholesalePrice, product.retailPrice],
            function(err) {
                if (err) {
                    console.error('插入产品失败:', err);
                    return;
                }
                
                const productId = this.lastID;
                console.log(`插入产品：${product.brand} - ${product.productName}, ID: ${productId}`);
                
                // 插入价格历史
                product.priceHistory.forEach((history) => {
                    db.run(
                        `INSERT INTO price_history (product_id, date, retail_price, wholesale_price) VALUES (?, ?, ?, ?)`,
                        [productId, history.date, history.retailPrice, history.wholesalePrice],
                        (err) => {
                            if (err) {
                                console.error('插入价格历史失败:', err);
                            }
                        }
                    );
                });
                
                productCount++;
                if (productCount === totalProducts) {
                    console.log(`\n数据插入完成！共插入 ${totalProducts} 个产品`);
                    db.close();
                }
            }
        );
    });
}
