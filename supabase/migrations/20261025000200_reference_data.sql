-- Reference data required by the application (not demo data): component categories and the
-- specification fields each category uses. Mirrors CATEGORIES / SPEC_FIELDS in shared/uw-core.js.

insert into component_categories (key, label, icon, sort_order) values
  ('cpu', 'CPU', 'cpu', 1),
  ('motherboard', 'Motherboard', 'circuit-board', 2),
  ('ram', 'Memory', 'memory-stick', 3),
  ('gpu', 'Graphics card', 'monitor', 4),
  ('cooler', 'CPU cooler', 'fan', 5),
  ('psu', 'Power supply', 'zap', 6),
  ('storage', 'Storage', 'hard-drive', 7),
  ('case', 'PC case', 'box', 8);

insert into spec_definitions (category_key, spec_key, label, data_type, unit, options, sort_order) values
  ('cpu', 'socket', 'Socket', 'select', null, array['AM4', 'AM5', 'LGA1700'], 1),
  ('cpu', 'cores', 'Cores / threads', 'text', null, null, 2),
  ('cpu', 'maxPower', 'Max power draw', 'number', 'W', null, 3),
  ('cpu', 'igpu', 'Integrated graphics', 'select', null, array['Yes', 'No'], 4),

  ('motherboard', 'socket', 'Socket', 'select', null, array['AM4', 'AM5', 'LGA1700'], 1),
  ('motherboard', 'chipset', 'Chipset', 'text', null, null, 2),
  ('motherboard', 'form', 'Form factor', 'select', null, array['ATX', 'Micro-ATX', 'Mini-ITX'], 3),
  ('motherboard', 'memType', 'Memory type', 'select', null, array['DDR4', 'DDR5'], 4),
  ('motherboard', 'm2', 'M.2 slots', 'number', null, null, 5),
  ('motherboard', 'sata', 'SATA ports', 'number', null, null, 6),
  ('motherboard', 'wifi', 'Wi-Fi', 'select', null, array['Yes', 'No'], 7),

  ('ram', 'type', 'Generation', 'select', null, array['DDR4', 'DDR5'], 1),
  ('ram', 'capacity', 'Kit capacity', 'number', 'GB', null, 2),
  ('ram', 'speed', 'Speed', 'number', 'MT/s', null, 3),

  ('gpu', 'chipBrand', 'GPU vendor', 'select', null, array['NVIDIA', 'AMD', 'Intel'], 1),
  ('gpu', 'vram', 'VRAM', 'number', 'GB', null, 2),
  ('gpu', 'length', 'Card length', 'number', 'mm', null, 3),
  ('gpu', 'power', 'Board power', 'number', 'W', null, 4),
  ('gpu', 'pcie8', '8-pin PCIe connectors', 'number', null, null, 5),
  ('gpu', 'hpwr', '16-pin (12V-2×6) connector', 'select', null, array['Yes', 'No'], 6),

  ('cooler', 'type', 'Type', 'select', null, array['Air', 'AIO'], 1),
  ('cooler', 'sockets', 'Supported sockets', 'text', null, null, 2),
  ('cooler', 'height', 'Height (air)', 'number', 'mm', null, 3),
  ('cooler', 'radiator', 'Radiator (AIO)', 'number', 'mm', null, 4),
  ('cooler', 'rating', 'Cooling rating', 'number', 'W', null, 5),

  ('psu', 'watt', 'Capacity', 'number', 'W', null, 1),
  ('psu', 'efficiency', 'Efficiency', 'text', null, null, 2),
  ('psu', 'pcie8', '8-pin PCIe connectors', 'number', null, null, 3),
  ('psu', 'hpwr', '16-pin (12V-2×6) connector', 'select', null, array['Yes', 'No'], 4),

  ('storage', 'iface', 'Interface', 'select', null, array['NVMe', 'SATA'], 1),
  ('storage', 'capacity', 'Capacity', 'number', 'GB', null, 2),
  ('storage', 'kind', 'Form', 'text', null, null, 3),

  ('case', 'forms', 'Motherboard support', 'text', null, null, 1),
  ('case', 'maxGpu', 'Max GPU length', 'number', 'mm', null, 2),
  ('case', 'maxCooler', 'Max cooler height', 'number', 'mm', null, 3),
  ('case', 'maxRad', 'Max radiator', 'number', 'mm', null, 4);
