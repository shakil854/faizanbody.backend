/**
 * Work Order / Job Card Model Definition
 * Represents truck body work orders with detailed section tasks,
 * 3 blank metadata boxes per section, completion checkboxes, and signatures.
 */
export const OrderModel = {
  tableName: 'work_orders',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    order_no: 'VARCHAR(50) NOT NULL',
    order_date: 'DATE NULL',
    condition_text: 'VARCHAR(255) NULL',
    owner_name: 'VARCHAR(200) NOT NULL',
    mobile_number: 'VARCHAR(50) NULL',
    entry_date: 'DATE NULL',
    truck_chassis_no: 'VARCHAR(100) NOT NULL',
    shade_no: 'VARCHAR(100) NULL',
    status: "VARCHAR(50) DEFAULT 'In Progress'",
    cabin_work: 'JSON NULL',
    inside_work: 'JSON NULL',
    body_work: 'JSON NULL',
    accessories: 'JSON NULL',
    finishing_work: 'JSON NULL',
    machro: 'JSON NULL',
    md_signature: 'VARCHAR(150) NULL',
    party_owner_signature: 'VARCHAR(150) NULL',
    notes: 'TEXT NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_orders_truck', column: 'truck_chassis_no' },
    { name: 'idx_orders_owner', column: 'owner_name' },
    { name: 'idx_orders_date', column: 'order_date' },
    { name: 'idx_orders_status', column: 'status' },
  ],
  initialSeed: [
    {
      order_no: 'WO-2025-001',
      order_date: '2025-02-15',
      condition_text: 'नया केबिन और बॉडी वर्क',
      owner_name: 'इकबाल भाई पटेल',
      mobile_number: '9876543210',
      entry_date: '2025-02-15',
      truck_chassis_no: 'GJ-01-AB-1234',
      shade_no: 'Royal Blue / 402',
      status: 'In Progress',
      cabin_work: JSON.stringify({
        boxes: ['', '', ''],
        items: {
          moro: { value: 'Standard Steel', done: true },
          peeth: { value: 'Heavy Duty', done: true },
          panal_chhapni: { value: 'Full Chrome Emboss', done: false },
          paga_khidki: { value: 'Double Sliding', done: false },
          dashboard_prakar: { value: 'Deluxe Plywood Finish', done: false },
          anya_kaam: { value: '', done: false },
        },
      }),
      inside_work: JSON.stringify({
        boxes: ['', '', ''],
        items: {
          niyamit_furniture_four_t: { value: 'Teak Finish 4-T', done: false },
          speaker_size: { value: '6x9 Inch Oval', done: false },
          sofa_seat: { value: 'Luxury Foam Sleeper', done: false },
          carrier: { value: 'Roof Luggage Carrier', done: false },
          anya_kaam: { value: '', done: false },
        },
      }),
      body_work: JSON.stringify({
        boxes: ['', '', ''],
        items: {
          runner: { value: '100x50 Channel', done: true },
          dhokha_lambai_matra: { value: '22 Feet / 4 Piece', done: true },
          side_oonchai: { value: '6.5 Feet', done: false },
          side_prakar: { value: 'पतरा', done: false },
          plate_motai_mm: { value: '3.15 mm Chequered', done: false },
          falka_prakar: { value: 'लोखंड', done: false },
          peeche_jaali_prakar: { value: 'Heavy Grill Pattern A', done: false },
          peeche_vel: { value: 'Special Design', done: false },
          side_khidki: { value: '2 x 3 Feet', done: false },
          anya_kaam: { value: '', done: false },
        },
      }),
      accessories: JSON.stringify({
        boxes: ['', '', ''],
        items: {
          bari_prakar: { value: 'Single Fold', done: false },
          niyamit: { value: 'Standard Tool Box', done: false },
          anya_kaam: { value: '', done: false },
        },
      }),
      finishing_work: JSON.stringify({
        color: { value: 'Dark Royal Blue Metallic', boxes: ['', '', ''], done: false },
        redium: { value: 'Yellow Reflective Strip 3M', boxes: ['', '', ''], done: false },
        painting: { value: 'Faizan Body Art Graphics', boxes: ['', '', ''], done: false },
        vayring: { value: 'Full LED Harness 12V/24V', boxes: ['', '', ''], done: false },
      }),
      machro: JSON.stringify({
        boxes: ['', '', ''],
        items: {
          plate_oonchai_thambhla: { value: '5 Feet / 6 Pole', done: false },
          side_pipe_matra_prakar: { value: '2 Inch Heavy Pipe', done: false },
          bhaya_matra_prakar: { value: 'Standard Gusset', done: false },
          dhar: { value: 'Round Edge Smooth', done: false },
          top_pipe_angle_prakar: { value: '50x5 Angle', done: false },
        },
      }),
      md_signature: 'Faizan',
      party_owner_signature: 'Iqbal Bhai',
      notes: 'Urgent delivery required by month end.',
    },
  ],
};

export default OrderModel;
