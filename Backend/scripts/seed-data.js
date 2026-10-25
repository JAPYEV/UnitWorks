/* Demonstration catalog for UnitWorks. Illustrative only: names are real product lines, but prices, stock,
   sales rates and lead times are invented sample values, not live inventory or market pricing.
   Used only by scripts/generate-seed.js to produce supabase/seed.sql. */

function P(id, category, brand, name, price, stock, minStock, dailySales, leadTime, moq, specs, perf) {
  return { id, sku: id.toUpperCase(), category, brand, name, price, cost: Math.round(price * 0.82 / 10) * 10,
    stock, minStock, dailySales: Math.round(dailySales * 50) / 100, leadTime, moq, specs, perf };
}

export const SEED_PRODUCTS = [
  P('cpu-r5-5600', 'cpu', 'AMD', 'AMD Ryzen 5 5600', 6450, 14, 5, 0.9, 7, 5, { socket: 'AM4', cores: '6 / 12', maxPower: 76, igpu: 'No' }, { gaming: 62, work: 52 }),
  P('cpu-r5-5600g', 'cpu', 'AMD', 'AMD Ryzen 5 5600G', 7450, 9, 4, 0.8, 7, 5, { socket: 'AM4', cores: '6 / 12', maxPower: 76, igpu: 'Yes' }, { gaming: 50, work: 48 }),
  P('cpu-r5-7600', 'cpu', 'AMD', 'AMD Ryzen 5 7600', 11200, 4, 6, 1.2, 10, 5, { socket: 'AM5', cores: '6 / 12', maxPower: 88, igpu: 'Yes' }, { gaming: 74, work: 63 }),
  P('cpu-r7-7800x3d', 'cpu', 'AMD', 'AMD Ryzen 7 7800X3D', 24500, 0, 3, 0.6, 14, 3, { socket: 'AM5', cores: '8 / 16', maxPower: 120, igpu: 'Yes' }, { gaming: 96, work: 74 }),
  P('cpu-i5-12400f', 'cpu', 'Intel', 'Intel Core i5-12400F', 6995, 18, 6, 1.1, 7, 5, { socket: 'LGA1700', cores: '6 / 12', maxPower: 117, igpu: 'No' }, { gaming: 60, work: 50 }),
  P('cpu-i5-14600k', 'cpu', 'Intel', 'Intel Core i5-14600K', 17800, 7, 4, 0.5, 10, 3, { socket: 'LGA1700', cores: '14 / 20', maxPower: 181, igpu: 'Yes' }, { gaming: 84, work: 86 }),
  P('cpu-i7-14700k', 'cpu', 'Intel', 'Intel Core i7-14700K', 24950, 3, 3, 0.3, 14, 2, { socket: 'LGA1700', cores: '20 / 28', maxPower: 253, igpu: 'Yes' }, { gaming: 90, work: 97 }),

  P('mb-a520m-k', 'motherboard', 'Gigabyte', 'Gigabyte A520M K V2', 3650, 20, 6, 0.8, 7, 5, { socket: 'AM4', chipset: 'A520', form: 'Micro-ATX', memType: 'DDR4', m2: 1, sata: 4, wifi: 'No' }, { score: 40 }),
  P('mb-b550m-vdh', 'motherboard', 'MSI', 'MSI B550M PRO-VDH WiFi', 6250, 9, 5, 0.7, 10, 5, { socket: 'AM4', chipset: 'B550', form: 'Micro-ATX', memType: 'DDR4', m2: 2, sata: 4, wifi: 'Yes' }, { score: 60 }),
  P('mb-b650m-tuf', 'motherboard', 'ASUS', 'ASUS TUF Gaming B650M-Plus WiFi', 10950, 5, 5, 0.9, 12, 4, { socket: 'AM5', chipset: 'B650', form: 'Micro-ATX', memType: 'DDR5', m2: 2, sata: 4, wifi: 'Yes' }, { score: 70 }),
  P('mb-b650-elite', 'motherboard', 'Gigabyte', 'Gigabyte B650 AORUS Elite AX', 13400, 6, 3, 0.4, 12, 3, { socket: 'AM5', chipset: 'B650', form: 'ATX', memType: 'DDR5', m2: 3, sata: 4, wifi: 'Yes' }, { score: 78 }),
  P('mb-b760m-a', 'motherboard', 'MSI', 'MSI PRO B760M-A DDR4', 7150, 11, 5, 0.8, 10, 5, { socket: 'LGA1700', chipset: 'B760', form: 'Micro-ATX', memType: 'DDR4', m2: 2, sata: 4, wifi: 'No' }, { score: 58 }),
  P('mb-z790-prors', 'motherboard', 'ASRock', 'ASRock Z790 Pro RS', 12800, 2, 3, 0.3, 14, 2, { socket: 'LGA1700', chipset: 'Z790', form: 'ATX', memType: 'DDR5', m2: 4, sata: 6, wifi: 'No' }, { score: 76 }),

  P('ram-fury-16-d4', 'ram', 'Kingston', 'Kingston FURY Beast 16GB (2×8GB) DDR4-3200', 2350, 32, 10, 1.6, 5, 10, { type: 'DDR4', capacity: 16, speed: 3200 }, { score: 40 }),
  P('ram-lpx-32-d4', 'ram', 'Corsair', 'Corsair Vengeance LPX 32GB (2×16GB) DDR4-3600', 4450, 15, 8, 1.0, 7, 10, { type: 'DDR4', capacity: 32, speed: 3600 }, { score: 68 }),
  P('ram-fury-32-d5', 'ram', 'Kingston', 'Kingston FURY Beast 32GB (2×16GB) DDR5-5600', 5750, 6, 8, 1.4, 7, 10, { type: 'DDR5', capacity: 32, speed: 5600 }, { score: 76 }),
  P('ram-flare-32-d5', 'ram', 'G.Skill', 'G.Skill Flare X5 32GB (2×16GB) DDR5-6000', 6350, 12, 6, 0.9, 10, 5, { type: 'DDR5', capacity: 32, speed: 6000 }, { score: 80 }),
  P('ram-tcreate-64-d5', 'ram', 'TeamGroup', 'TeamGroup T-Create Expert 64GB (2×32GB) DDR5-6000', 11900, 3, 2, 0.2, 14, 2, { type: 'DDR5', capacity: 64, speed: 6000 }, { score: 98 }),

  P('gpu-rtx3050-6g', 'gpu', 'Palit', 'Palit GeForce RTX 3050 StormX 6GB', 10950, 8, 4, 0.4, 10, 3, { chipBrand: 'NVIDIA', vram: 6, length: null, power: 70, pcie8: 0, hpwr: 'No' }, { gaming: 30, work: 28 }),
  P('gpu-rx7600', 'gpu', 'Sapphire', 'Sapphire Pulse Radeon RX 7600 8GB', 15500, 6, 4, 0.5, 12, 3, { chipBrand: 'AMD', vram: 8, length: 240, power: 165, pcie8: 1, hpwr: 'No' }, { gaming: 52, work: 38 }),
  P('gpu-rtx4060', 'gpu', 'MSI', 'MSI GeForce RTX 4060 Ventus 2X 8GB', 17950, 3, 6, 1.3, 12, 4, { chipBrand: 'NVIDIA', vram: 8, length: 199, power: 115, pcie8: 1, hpwr: 'No' }, { gaming: 55, work: 50 }),
  P('gpu-rtx4060ti', 'gpu', 'ASUS', 'ASUS Dual GeForce RTX 4060 Ti 8GB', 23950, 7, 4, 0.6, 14, 3, { chipBrand: 'NVIDIA', vram: 8, length: 227, power: 160, pcie8: 1, hpwr: 'No' }, { gaming: 66, work: 60 }),
  P('gpu-rx7800xt', 'gpu', 'PowerColor', 'PowerColor Hellhound Radeon RX 7800 XT 16GB', 31900, 0, 3, 0.5, 18, 2, { chipBrand: 'AMD', vram: 16, length: 322, power: 263, pcie8: 2, hpwr: 'No' }, { gaming: 84, work: 70 }),
  P('gpu-rtx4070s', 'gpu', 'Gigabyte', 'Gigabyte GeForce RTX 4070 SUPER WINDFORCE OC 12GB', 38500, 4, 3, 0.7, 18, 2, { chipBrand: 'NVIDIA', vram: 12, length: 261, power: 220, pcie8: 0, hpwr: 'Yes' }, { gaming: 88, work: 86 }),

  P('cool-wraith-prism', 'cooler', 'AMD', 'AMD Wraith Prism', 1250, 10, 4, 0.3, 7, 5, { type: 'Air', sockets: 'AM4, AM5', height: 93, radiator: null, rating: 105 }, { score: 30 }),
  P('cool-hyper212-blk', 'cooler', 'Cooler Master', 'Cooler Master Hyper 212 Black', 1950, 16, 6, 0.6, 7, 6, { type: 'Air', sockets: 'AM4, AM5, LGA1700', height: 159, radiator: null, rating: 180 }, { score: 50 }),
  P('cool-ak400', 'cooler', 'DeepCool', 'DeepCool AK400', 1650, 5, 8, 1.1, 7, 10, { type: 'Air', sockets: 'AM4, AM5, LGA1700', height: 155, radiator: null, rating: 220 }, { score: 60 }),
  P('cool-pa120se', 'cooler', 'Thermalright', 'Thermalright Peerless Assassin 120 SE', 2150, 13, 6, 0.9, 10, 10, { type: 'Air', sockets: 'AM4, AM5, LGA1700', height: 155, radiator: null, rating: 245 }, { score: 72 }),
  P('cool-nhd15', 'cooler', 'Noctua', 'Noctua NH-D15', 6900, 4, 2, 0.1, 21, 2, { type: 'Air', sockets: 'AM4, AM5, LGA1700', height: 165, radiator: null, rating: 250 }, { score: 85 }),
  P('cool-lf3-240', 'cooler', 'ARCTIC', 'ARCTIC Liquid Freezer III 240', 5600, 6, 3, 0.3, 14, 2, { type: 'AIO', sockets: 'AM4, AM5, LGA1700', height: null, radiator: 240, rating: 300 }, { score: 90 }),

  P('psu-mwe550', 'psu', 'Cooler Master', 'Cooler Master MWE 550 Bronze V2', 2750, 22, 8, 0.9, 7, 10, { watt: 550, efficiency: '80+ Bronze', pcie8: 1, hpwr: 'No' }, { score: 45 }),
  P('psu-cx650', 'psu', 'Corsair', 'Corsair CX650', 3450, 9, 6, 0.8, 7, 5, { watt: 650, efficiency: '80+ Bronze', pcie8: 2, hpwr: 'No' }, { score: 55 }),
  P('psu-gx750', 'psu', 'Seasonic', 'Seasonic FOCUS GX-750', 6250, 2, 4, 0.5, 14, 3, { watt: 750, efficiency: '80+ Gold', pcie8: 4, hpwr: 'No' }, { score: 78 }),
  P('psu-a850gl', 'psu', 'MSI', 'MSI MAG A850GL PCIE5', 7450, 7, 3, 0.4, 14, 2, { watt: 850, efficiency: '80+ Gold', pcie8: 3, hpwr: 'Yes' }, { score: 82 }),

  P('ssd-nv2-1t', 'storage', 'Kingston', 'Kingston NV2 1TB NVMe SSD', 3150, 3, 12, 2.1, 5, 10, { iface: 'NVMe', capacity: 1000, kind: 'M.2 PCIe 4.0' }, { score: 55 }),
  P('ssd-990evo-1t', 'storage', 'Samsung', 'Samsung 990 EVO 1TB NVMe SSD', 4950, 14, 8, 1.2, 7, 5, { iface: 'NVMe', capacity: 1000, kind: 'M.2 PCIe 4.0/5.0' }, { score: 72 }),
  P('ssd-sn580-2t', 'storage', 'WD', 'WD Blue SN580 2TB NVMe SSD', 6450, 10, 5, 0.8, 7, 5, { iface: 'NVMe', capacity: 2000, kind: 'M.2 PCIe 4.0' }, { score: 82 }),
  P('ssd-mx500-1t', 'storage', 'Crucial', 'Crucial MX500 1TB SATA SSD', 3350, 0, 5, 0.6, 7, 5, { iface: 'SATA', capacity: 1000, kind: '2.5" SATA SSD' }, { score: 40 }),
  P('hdd-barracuda-2t', 'storage', 'Seagate', 'Seagate BarraCuda 2TB HDD', 3050, 17, 6, 0.5, 10, 5, { iface: 'SATA', capacity: 2000, kind: '3.5" 7200 rpm HDD' }, { score: 22 }),

  P('case-forge-m2', 'case', 'Tecware', 'Tecware Forge M2', 2450, 11, 5, 0.7, 10, 4, { forms: 'Micro-ATX, Mini-ITX', maxGpu: 300, maxCooler: 160, maxRad: 240 }, { score: 50 }),
  P('case-q300l', 'case', 'Cooler Master', 'Cooler Master MasterBox Q300L', 2350, 4, 4, 0.4, 10, 4, { forms: 'Micro-ATX, Mini-ITX', maxGpu: 360, maxCooler: 157, maxRad: 240 }, { score: 45 }),
  P('case-a3-matx', 'case', 'Lian Li', 'Lian Li A3-mATX', 4950, 6, 3, 0.5, 14, 3, { forms: 'Micro-ATX, Mini-ITX', maxGpu: 415, maxCooler: 165, maxRad: 360 }, { score: 75 }),
  P('case-h5-flow', 'case', 'NZXT', 'NZXT H5 Flow', 5450, 5, 3, 0.4, 14, 2, { forms: 'ATX, Micro-ATX, Mini-ITX', maxGpu: 365, maxCooler: 165, maxRad: 280 }, { score: 72 }),
  P('case-air903', 'case', 'Montech', 'Montech AIR 903 BASE', 4350, 8, 3, 0.4, 14, 2, { forms: 'ATX, Micro-ATX, Mini-ITX', maxGpu: 400, maxCooler: 180, maxRad: 360 }, { score: 80 })
];

export const SEED_MOVEMENTS = [
  ['m12', '2026-10-21T15:10', 'ssd-nv2-1t', 'Sale', -2, 'POS #10482', 'J. Dela Cruz'],
  ['m11', '2026-10-21T13:45', 'gpu-rtx4060', 'Sale', -1, 'Build order BO-2291', 'A. Reyes'],
  ['m10', '2026-10-21T11:20', 'ram-fury-16-d4', 'Received', 20, 'PO-0612 · supplier delivery', 'M. Santos'],
  ['m09', '2026-10-21T10:05', 'cpu-r5-7600', 'Sale', -2, 'POS #10477', 'J. Dela Cruz'],
  ['m08', '2026-10-20T17:40', 'ssd-mx500-1t', 'Adjustment', -1, 'Damaged in storage', 'M. Santos'],
  ['m07', '2026-10-20T16:12', 'gpu-rx7800xt', 'Sale', -1, 'Build order BO-2288', 'A. Reyes'],
  ['m06', '2026-10-20T14:30', 'cool-ak400', 'Sale', -3, 'POS #10461', 'J. Dela Cruz'],
  ['m05', '2026-10-20T09:15', 'psu-mwe550', 'Received', 10, 'PO-0609 · supplier delivery', 'M. Santos'],
  ['m04', '2026-10-19T18:02', 'mb-b650m-tuf', 'Return', 1, 'Customer return, sealed', 'A. Reyes'],
  ['m03', '2026-10-19T15:44', 'cpu-r7-7800x3d', 'Sale', -1, 'Build order BO-2280', 'A. Reyes'],
  ['m02', '2026-10-19T12:10', 'ram-fury-32-d5', 'Sale', -2, 'POS #10433', 'J. Dela Cruz'],
  ['m01', '2026-10-18T16:30', 'case-q300l', 'Adjustment', -1, 'Cycle count variance', 'M. Santos']
].map(([id, date, productId, type, qty, note, user]) => ({ id, date, productId, type, qty, note, user }));
