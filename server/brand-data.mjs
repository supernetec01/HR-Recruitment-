// Additive migration. Seed only when the table is first introduced, never on restart.
export function initializeBrands(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const existed = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='company_brands'").get();
    db.exec(`CREATE TABLE IF NOT EXISTS company_brands (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      category_zh TEXT NOT NULL DEFAULT '', description_zh TEXT NOT NULL DEFAULT '', channels TEXT NOT NULL DEFAULT '[]',
      logo BLOB, logo_hash TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    if (!existed) {
      const seeds = [
        ['safestraps','Safestraps','Phụ kiện xe','Khám phá các sản phẩm phụ kiện xe của Safestraps tại gian hàng Shopee.','汽车配件','在 Shopee 店铺了解 Safestraps 的汽车配件产品。','https://shopee.vn/safestraps?entryPoint=ShopBySearch&searchKeyword=safestraps'],
        ['jielien','JieLien','Loa & thiết bị âm thanh','Xem các sản phẩm loa và thiết bị âm thanh của JieLien tại gian hàng Shopee.','音箱与音频设备','在 Shopee 店铺浏览 JieLien 的音箱与音频设备。','https://vn.shp.ee/2ZrUpPRj'],
        ['baby-tatto','Baby tatto','Mẹ và Bé','Tham khảo các sản phẩm dành cho mẹ và bé của Baby tatto tại gian hàng Shopee.','母婴用品','在 Shopee 店铺了解 Baby tatto 的母婴产品。','https://shopee.vn/babytattoo?categoryId=100632&entryPoint=ShopByPDP&itemId=20716712617'],
      ];
      const insert = db.prepare('INSERT INTO company_brands(id,name,category,description,category_zh,description_zh,channels,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
      const timestamp = new Date().toISOString();
      seeds.forEach(([id,name,category,description,categoryZh,descriptionZh,url], index) => insert.run(id,name,category,description,categoryZh,descriptionZh,JSON.stringify([{label:'Shopee',url}]),index,timestamp,timestamp));
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
