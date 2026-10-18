-- ============================================================
-- BidForge : 03_sample_data.sql
-- Fills the five tables by calling the real procedures, so every row
-- follows the rules. All seeded accounts use the password Sample#2026
-- (stored as a SHA-256 hash, like users who register on the website).
-- ============================================================
SET DEFINE OFF
SET SERVEROUTPUT ON

DECLARE
  v_msg  VARCHAR2(200);
  v_pw   VARCHAR2(64) := hash_pw('Sample#2026');

  u_primary NUMBER; u_second NUMBER; u_sana NUMBER; u_priya NUMBER;
  u_rahul NUMBER; u_meena NUMBER; u_karthik NUMBER; u_temp NUMBER;

  i_ring NUMBER; i_pearl NUMBER; i_pend NUMBER; i_brace NUMBER; i_hoop NUMBER;
  i_neck NUMBER; i_diam NUMBER; i_anklet NUMBER; i_plat NUMBER; i_ruby NUMBER; i_pearlneck NUMBER;
  a NUMBER;
BEGIN
  -- ---------- USERS (the trigger creates each user's wallet row) ----------
  register_user('Primary User',     'primary@bidforge.test',    v_pw, '9876500001', 'Anna Nagar, Chennai',    u_primary,    v_msg);
  register_user('Second Bidder', 'bidder2@bidforge.test', v_pw, '9876500005', 'Koramangala, Bengaluru', u_second,  v_msg);
  register_user('Sana Iyer',     'sana@bidforge.test',    v_pw, '9876500004', 'Adyar, Chennai',         u_sana,    v_msg);
  register_user('Priya Nair',    'priya@example.com',     v_pw, '9876543211', 'Kochi',                  u_priya,   v_msg);
  register_user('Rahul Singh',   'rahul@example.com',     v_pw, '9876543212', 'Delhi',                  u_rahul,   v_msg);
  register_user('Meena Rao',     'meena@example.com',     v_pw, '9876543213', 'Hyderabad',              u_meena,   v_msg);
  register_user('Karthik S',     'karthik@example.com',   v_pw, '9876543214', 'Coimbatore',             u_karthik, v_msg);
  register_user('Temp User',     'temp@example.com',      v_pw, '9876543299', NULL,                     u_temp,    v_msg);

  -- ---------- WALLET (add money) ----------
  add_money(u_primary,    250000, v_msg);
  add_money(u_second,  350000, v_msg);
  add_money(u_sana,    300000, v_msg);
  add_money(u_priya,    90000, v_msg);
  add_money(u_rahul,    60000, v_msg);
  add_money(u_meena,   120000, v_msg);
  add_money(u_karthik,  80000, v_msg);

  -- ---------- ITEMS ----------
  add_item(u_sana,   'Solitaire Diamond Ring',  'Round brilliant solitaire, 0.7 ct, on an 18K white gold band.', 'Rings',     'Like New', 95000, i_ring,  v_msg);
  add_item(u_sana,   'Pearl Drop Earrings',     'Freshwater pearl drops on rose gold hooks.',                    'Earrings',  'New',      28000, i_pearl, v_msg);
  add_item(u_sana,   'Emerald Cut Pendant',     'Colombian emerald in a gold bezel, with chain.',                'Pendants',  'Good',     52000, i_pend,  v_msg);
  add_item(u_primary,   'Antique Silver Filigree Bracelet', 'Hand-worked filigree, around 1930.',                   'Bracelets', 'Good',     12000, i_brace, v_msg);
  add_item(u_primary,   'Gold Hoop Earrings',      'Classic 22K hoops, 4 g.',                                       'Earrings',  'New',      18000, i_hoop,  v_msg);
  add_item(u_priya,  'Gold Necklace 22K',       'Traditional temple design, 25 g.',                              'Necklaces', 'Like New', 20000, i_neck,  v_msg);
  add_item(u_priya,  'Diamond Ring',            '0.5 carat solitaire.',                                          'Rings',     'New',      35000, i_diam,  v_msg);
  add_item(u_rahul,  'Silver Anklet Pair',      'Pure silver, 80 g.',                                            'Bracelets', 'Good',      4000, i_anklet,v_msg);
  add_item(u_rahul,  'Platinum Bracelet',       'Plain platinum link bracelet.',                                 'Bracelets', 'Like New', 38000, i_plat,  v_msg);
  add_item(u_meena,  'Ruby Pendant',            'Burmese ruby in 22K gold.',                                     'Pendants',  'Good',     45000, i_ruby,  v_msg);
  add_item(u_karthik,'Pearl Necklace',          'Single strand, 14K clasp.',                                     'Necklaces', 'Fair',     25000, i_pearlneck, v_msg);

  -- ---------- AUCTIONS (one per item, as in the ER diagram) ----------
  create_auction(u_sana,   i_ring,  95000, SYSDATE, SYSDATE + 2/24, a, v_msg);   -- ring: ends in 2 hours
  create_auction(u_sana,   i_pearl, 28000, SYSDATE, SYSDATE + 1,    a, v_msg);
  create_auction(u_sana,   i_pend,  52000, SYSDATE, SYSDATE + 3,    a, v_msg);
  create_auction(u_primary,   i_brace, 12000, SYSDATE, SYSDATE + 1,    a, v_msg);   -- no bids: can be cancelled / edited
  create_auction(u_priya,  i_neck,  20000, SYSDATE, SYSDATE + 2,    a, v_msg);
  create_auction(u_priya,  i_diam,  35000, SYSDATE, SYSDATE + 2,    a, v_msg);
  create_auction(u_rahul,  i_anklet, 4000, SYSDATE, SYSDATE + 1,    a, v_msg);   -- will be closed below
  create_auction(u_rahul,  i_plat,  38000, SYSDATE, SYSDATE + 1,    a, v_msg);   -- will end with no bids
  create_auction(u_meena,  i_ruby,  45000, SYSDATE, SYSDATE + 1,    a, v_msg);   -- will be cancelled
  create_auction(u_karthik,i_pearlneck, 25000, SYSDATE + 1, SYSDATE + 4, a, v_msg); -- upcoming

  -- ---------- BIDS (accepted and rejected attempts) ----------
  DECLARE
    PROCEDURE bid (p_item NUMBER, p_user NUMBER, p_amt NUMBER) IS
      v_a NUMBER;
    BEGIN
      SELECT AuctionID INTO v_a FROM Auctions WHERE ItemID = p_item;
      place_bid(v_a, p_user, p_amt, v_msg);
    END;
  BEGIN
    bid(i_neck,  u_rahul,  19000);     -- rejected: below the starting price
    bid(i_neck,  u_rahul,  21000);     -- accepted
    bid(i_neck,  u_meena,  22000);     -- accepted
    bid(i_neck,  u_priya,  23000);     -- rejected: own item
    bid(i_neck,  u_rahul,  24000);     -- accepted
    bid(i_diam,  u_karthik,36000);     -- accepted
    bid(i_pearl, u_second, 29000);     -- accepted
    bid(i_anklet,u_karthik, 4500);     -- accepted (this auction is closed below)
  END;

  -- ---------- a finished auction: wind the clock back, then settle it ----------
  UPDATE Auctions SET StartTime = SYSDATE - 2, EndTime = SYSDATE - 1/24
  WHERE  ItemID IN (i_anklet, i_plat);
  COMMIT;
  close_expired_auctions;

  -- ---------- a cancelled auction ----------
  SELECT AuctionID INTO a FROM Auctions WHERE ItemID = i_ruby;
  cancel_auction(a, u_meena, v_msg);

  DBMS_OUTPUT.PUT_LINE('Sample data created.');
END;
/

PROMPT
PROMPT ===== Row counts =====
SELECT 'Users' AS tbl, COUNT(*) AS rows_in_table FROM Users
UNION ALL SELECT 'Items',    COUNT(*) FROM Items
UNION ALL SELECT 'Auctions', COUNT(*) FROM Auctions
UNION ALL SELECT 'Bids',     COUNT(*) FROM Bids
UNION ALL SELECT 'Wallet',   COUNT(*) FROM Wallet;
