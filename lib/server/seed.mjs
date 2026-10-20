import { randomBytes, scryptSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { one, run, id, transaction, query } from "./db.mjs";
export async function seed() {
  return transaction(async () => {
    await query(
      "SELECT pg_advisory_xact_lock(hashtext(current_schema() || 'seed'))",
    );
    if (!(await one("SELECT id FROM products LIMIT 1"))) {
      await transaction(async () => {
        const seed = [
          [
            "silk",
            "CL-CAD-SILK-60",
            "Dairy Milk Silk",
            "Cadbury",
            "Milk chocolate",
            "60 g",
            9500,
            10000,
            48,
            "/images/silk.png",
            "lavender",
            "Smooth, creamy chocolate for the little moments that deserve something lovely.",
          ],
          [
            "kitkat",
            "CL-NES-KKD-50",
            "KitKat Delights Dark",
            "Nestlé",
            "Wafers & bites",
            "50 g",
            6000,
            7000,
            36,
            "/images/kitkat.png",
            "pink",
            "Crisp wafer layers with a dark chocolate twist. A proper pause in a busy day.",
          ],
          [
            "dairy-milk",
            "CL-CAD-DM-38",
            "Dairy Milk Classic",
            "Cadbury",
            "Milk chocolate",
            "38 g",
            4500,
            5000,
            65,
            "/images/dairy-milk.png",
            "sand",
            "The familiar milk chocolate favourite. Simple, shareable, and always welcome.",
          ],
          [
            "ferrero",
            "CL-FER-16",
            "Ferrero Rocher",
            "Ferrero",
            "Gift boxes",
            "16 pieces",
            54900,
            59900,
            18,
            "/images/ferrero.png",
            "green",
            "Golden-wrapped chocolate and hazelnut treats for a thoughtful little celebration.",
          ],
          [
            "silk-almond",
            "CL-CAD-ALM-143",
            "Silk Roast Almond",
            "Cadbury",
            "Milk chocolate",
            "143 g",
            10000,
            11000,
            24,
            "/images/silk-almond.jpg",
            "sand",
            "Creamy milk chocolate meets crunchy roasted almonds. A happy pairing.",
          ],
          [
            "amul",
            "CL-AMUL-DARK-300",
            "Amul Dark Chocolate Duo",
            "Amul",
            "Dark chocolate",
            "2 × 150 g",
            27000,
            30000,
            8,
            "/images/amul.png",
            "green",
            "A duo of Amul dark chocolate bars, made for sharing or a well-stocked chocolate drawer.",
          ],
          [
            "kitkat-share",
            "CL-NES-KK-SHARE",
            "KitKat Share & Snap",
            "Nestlé",
            "Wafers & bites",
            "57 g",
            9500,
            10000,
            32,
            "/images/kitkat-share.jpg",
            "pink",
            "Break off a little happiness and pass it around. The classic wafer break in a sharing pack.",
          ],
        ];
        for (const [
          pid,
          sku,
          name,
          brand,
          category,
          weight,
          price,
          mrp,
          stock,
          image,
          color,
          description,
        ] of seed) {
          await run(
            "INSERT INTO products(id,sku,name,brand,category,weight,price,mrp,stock,image,color,description,ingredients,allergens,cost,featured) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
            pid,
            sku,
            name,
            brand,
            category,
            weight,
            price,
            mrp,
            stock,
            image,
            color,
            description,
            "Sample catalogue. Refer to the actual pack for the complete ingredients and nutrition information.",
            "Contains milk. May contain nuts, soy and wheat; check the pack before consumption.",
            Math.round(price * 0.65),
            1,
          );
          await run(
            "INSERT INTO batches(id,product_id,lot,supplier,quantity,expires_on) VALUES ($1,$2,$3,$4,$5,$6)",
            id(),
            pid,
            "DEMO-" + sku,
            "Demo opening stock",
            stock,
            "2027-06-30",
          );
          await run(
            "INSERT INTO stock_movements(product_id,delta,reason,actor) VALUES ($1,$2,$3,$4)",
            pid,
            stock,
            "Opening sample stock",
            "system",
          );
        }
        await run(
          "INSERT INTO coupons(code,percent,min_total,max_discount,usage_limit,expires_on) VALUES ($1,$2,$3,$4,$5,$6)",
          "SWEET10",
          10,
          19900,
          10000,
          100,
          "2027-12-31",
        );
        const settings = {
          name: "Cocoa Local",
          currency: "INR",
          shipping: 4900,
          freeShipping: 49900,
          pincodes: [
            "400001",
            "400002",
            "400004",
            "400008",
            "400012",
            "400013",
            "400014",
            "400016",
            "400018",
            "400019",
            "400020",
            "400021",
            "400022",
            "400025",
            "400026",
            "400028",
            "400030",
            "400031",
            "400033",
            "400034",
            "400036",
            "400037",
            "400050",
            "400051",
            "400052",
            "400053",
            "400054",
            "400055",
            "400056",
            "400057",
            "400058",
            "400059",
            "400060",
            "400061",
            "400064",
            "400067",
            "400069",
            "400070",
            "400071",
            "400072",
            "400076",
            "400080",
            "400086",
            "400089",
            "400093",
            "400097",
            "400098",
            "400099",
            "400101",
            "400104",
          ],
          deliveryWindow: "1–2 business days",
          supportEmail: "hello@cocoalocal.example",
        };
        for (const [key, value] of Object.entries(settings))
          await run(
            "INSERT INTO settings(key,value) VALUES ($1,$2)",
            key,
            JSON.stringify(value),
          );
      });
    }
    if (!(await one("SELECT id FROM users WHERE role='admin' LIMIT 1"))) {
      const password =
        process.env.ADMIN_PASSWORD || randomBytes(18).toString("base64url");
      const salt = randomBytes(16).toString("hex");
      const hash = scryptSync(password, salt, 64, {
        N: 32768,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
      }).toString("hex");
      const email = process.env.ADMIN_EMAIL || "admin@cocoalocal.test";
      await run(
        "INSERT INTO users(id,name,email,phone,password_hash,role,verified) VALUES ($1,$2,$3,$4,$5,$6,1)",
        id(),
        "Store owner",
        email,
        "9000000000",
        salt + ":" + hash,
        "admin",
      );
      if (!process.env.ADMIN_PASSWORD && !process.env.TEST_DATABASE_URL)
        writeFileSync(
          join(process.cwd(), ".local-access.json"),
          JSON.stringify(
            {
              email,
              password,
              note: "Local demo owner access only. Generated once; ignored by Git.",
            },
            null,
            2,
          ),
          { mode: 0o600 },
        );
    }
  });
}
