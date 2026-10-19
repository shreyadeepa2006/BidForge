"""
BidForge : app.py   (the API / connection layer)

    Browser (frontend/)  ->  this Flask program  ->  Oracle (procedures, functions, views)

Every business rule lives in Oracle (see database/02_procedures.sql). This file only
  1. checks the input,
  2. calls the right procedure or view,
  3. reshapes the rows into the JSON the website expects.

How to run:
  1. pip install -r requirements.txt
  2. Set your Oracle login (do NOT type the password into this file):
       Windows (cmd):   set DB_PASSWORD=your_password
       Mac / Linux:     export DB_PASSWORD=your_password
     Optional: DB_USER (default SYSTEM) and DB_DSN (default localhost:1521/XEPDB1,
     or localhost:1521/XE on older installs)
  3. python app.py
  4. Open http://localhost:5000
"""
import hashlib
import os
import re
import socket
from datetime import datetime

import oracledb
from flask import Flask, jsonify, request, send_from_directory

# ============================ SETTINGS ============================
DB_USER = os.environ.get("DB_USER", "SYSTEM")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_DSN = os.environ.get("DB_DSN", "localhost:1521/XEPDB1")   # or localhost:1521/XE
# ==================================================================

INITIAL_WALLET_CREDIT = int(os.environ.get("INITIAL_WALLET_CREDIT", "0"))  # Set a positive value only if your deployment requires a signup credit
MAX_TOP_UP = 500000

CONDITIONS = ("New", "Like New", "Good", "Fair")      # matches the CHECK on Items.Condition

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "frontend"))
app = Flask(__name__, static_folder=None)

if not DB_PASSWORD:
    raise SystemExit("Set your Oracle password first:  set DB_PASSWORD=your_password   (Windows)  "
                     "or  export DB_PASSWORD=your_password   (Mac/Linux)")

pool = oracledb.create_pool(user=DB_USER, password=DB_PASSWORD, dsn=DB_DSN,
                            min=0, max=5, increment=1,
                            tcp_connect_timeout=10,
                            getmode=oracledb.POOL_GETMODE_TIMEDWAIT,
                            wait_timeout=10000)

# Oracle returns column names in CAPITALS. This maps them back to the
# spelling the website uses (same as the table columns).
NAMES = {n.upper(): n for n in [
    "UserID", "FullName", "Email", "PhoneNo", "WalletBalance", "DateJoined", "Address",
    "ItemID", "SellerID", "ItemName", "Description", "Category", "Condition",
    "StartingPrice", "CreatedAt",
    "AuctionID", "WinningUserID", "CurrentHighestBid", "StartTime", "EndTime", "Status",
    "BidID", "BidAmount", "BidTime",
    "TransactionID", "TransactionType", "TransactionDate",
    "ItemStartingPrice", "SellerFullName", "WinnerFullName", "BidderFullName",
    "BidCount", "Phase", "MinRaise", "MinNextBid", "Held",
    "SellerName", "BidderName", "OwnerName",
]}


# ------------------------------------------------------------------
# Small helpers
# ------------------------------------------------------------------
def ok(**data):
    return jsonify(ok=True, **data)


def fail(message, code=200, **extra):
    return jsonify(ok=False, error=message, **extra), code


def split_result(text):
    """Procedures return text like 'SUCCESS: Bid placed' or 'FAILED: reason'."""
    text = text or ""
    if ": " in text:
        head, msg = text.split(": ", 1)
    else:
        head, msg = "", text
    return head.strip().upper() == "SUCCESS", msg


def hash_password(password):
    """SHA-256 hex. the database login procedure compares the same SHA-256 digest."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def short_name(full):
    """'Meera Kapoor' -> 'Meera K.'  (bidders see each other as short names only)"""
    if not full:
        return ""
    parts = full.strip().split()
    return parts[0] + " " + parts[-1][0] + "." if len(parts) > 1 else parts[0]


def jsonable(value):
    if isinstance(value, datetime):
        return value.astimezone().isoformat()     # DB time is this machine's local time
    return value


def query(cur, sql, **binds):
    """Run a SELECT and return a list of dicts keyed like the website expects."""
    cur.execute(sql, binds)
    cols = [NAMES.get(d[0], d[0]) for d in cur.description]
    return [{c: jsonable(v) for c, v in zip(cols, row)} for row in cur.fetchall()]


def parse_time(text):
    """Browser sends an ISO time (UTC). Oracle DATEs here are local, so convert."""
    d = datetime.fromisoformat(str(text).replace("Z", "+00:00"))
    return d.astimezone().replace(tzinfo=None) if d.tzinfo else d


def clean_phone(raw):
    """Returns (phone or None, error or None)."""
    phone = re.sub(r"[\s-]", "", raw or "")
    if not phone:
        return None, None
    if not re.fullmatch(r"\+?\d{10,14}", phone):
        return None, "Enter a phone number with 10 to 14 digits."
    return phone, None


EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")


# ------------------------------------------------------------------
# Plumbing: CORS, errors, settling finished auctions, the website itself
# ------------------------------------------------------------------
@app.after_request
def allow_other_origins(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return resp


@app.errorhandler(oracledb.DatabaseError)
def database_error(e):
    print("DATABASE ERROR:", e)
    return fail("Database error: " + str(e), 500)


@app.before_request
def settle_finished_auctions():
    """Before every API call, close auctions whose end time has passed
    (the winner pays, the seller is paid). Done by close_expired_auctions in Oracle."""
    if request.path.startswith("/api/") and request.method != "OPTIONS":
        with pool.acquire() as conn:
            conn.cursor().callproc("close_expired_auctions")


@app.get("/")
def home():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/<path:filename>")
def frontend_files(filename):
    return send_from_directory(FRONTEND_DIR, filename)


# ------------------------------------------------------------------
# Shaping rows (from the v_auction_detail view) for the website
# ------------------------------------------------------------------
def shape_auction(r):
    return {
        "AuctionID": r["AuctionID"], "ItemID": r["ItemID"], "WinningUserID": r["WinningUserID"],
        "StartingPrice": r["StartingPrice"], "CurrentHighestBid": r["CurrentHighestBid"],
        "StartTime": r["StartTime"], "EndTime": r["EndTime"], "Status": r["Status"],
        "item": {
            "ItemID": r["ItemID"], "SellerID": r["SellerID"], "ItemName": r["ItemName"],
            "Description": r["Description"], "Category": r["Category"], "Condition": r["Condition"],
            "StartingPrice": r["ItemStartingPrice"], "CreatedAt": r["CreatedAt"],
        },
        "SellerID": r["SellerID"],
        "sellerName": short_name(r["SellerFullName"]),
        "bidCount": int(r["BidCount"]),
        "phase": r["Phase"],
        "minNextBid": r["MinNextBid"],
        "increment": r["MinRaise"],
        "winnerName": short_name(r["WinnerFullName"]),
    }


def standing_of(bid, auction, user_id):
    """Where one of my bids stands: Winning / Outbid / Won / Lost / Rejected / Cancelled."""
    if bid["Status"] == "Rejected":
        return "Rejected"
    if auction["phase"] == "cancelled":
        return "Cancelled"
    leading = auction["WinningUserID"] == user_id and bid["BidAmount"] == auction["CurrentHighestBid"]
    if auction["phase"] == "ended":
        return "Won" if leading else "Lost"
    return "Winning" if leading else "Outbid"


def my_bids(cur, user_id):
    bids = query(cur, """
        SELECT BidID, AuctionID, ItemID, UserID, WinningUserID, BidAmount, BidTime, Status
        FROM   Bids WHERE UserID = :u ORDER BY BidTime DESC, BidID DESC""", u=user_id)
    auctions = {}
    for r in query(cur, """
            SELECT * FROM v_auction_detail
            WHERE  AuctionID IN (SELECT AuctionID FROM Bids WHERE UserID = :u)""", u=user_id):
        auctions[r["AuctionID"]] = shape_auction(r)
    out = []
    for b in bids:
        a = auctions[b["AuctionID"]]
        out.append({**b, "auction": a, "standing": standing_of(b, a, user_id)})
    return out


def public_user(cur, user_id):
    rows = query(cur, """
        SELECT UserID, FullName, Email, PhoneNo, WalletBalance, DateJoined, Address
        FROM   Users WHERE UserID = :u""", u=user_id)
    return rows[0] if rows else None


# ------------------------------------------------------------------
# USERS   (register_user, login_user, update_user)
# ------------------------------------------------------------------
@app.post("/api/register")
def register():
    d = request.get_json(silent=True) or {}
    name = (d.get("FullName") or "").strip()
    email = (d.get("Email") or "").strip().lower()
    address = (d.get("Address") or "").strip()
    password = d.get("Password") or ""
    phone, phone_error = clean_phone(d.get("PhoneNo"))

    if not 2 <= len(name) <= 100:
        return fail("Enter your full name (2 to 100 characters).")
    if not EMAIL_RE.match(email) or len(email) > 100:
        return fail("Enter a valid email address.")
    if phone_error:
        return fail(phone_error)
    if len(password) < 8 or not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return fail("Use at least 8 characters with a letter and a number.")
    if len(address) > 200:
        return fail("Address can be at most 200 characters.")

    with pool.acquire() as conn:
        cur = conn.cursor()
        user_id = cur.var(int)
        result = cur.var(str)
        cur.callproc("register_user", [name, email, hash_password(password), phone,
                                       address or None, user_id, result])
        success, msg = split_result(result.getvalue())
        if not success:
            return fail(msg)

        uid = int(user_id.getvalue())
        if INITIAL_WALLET_CREDIT > 0:
            cur.callproc("add_money", [uid, INITIAL_WALLET_CREDIT, cur.var(str)])
        return ok(user=public_user(cur, uid))


@app.post("/api/login")
def login():
    d = request.get_json(silent=True) or {}
    email = (d.get("email") or "").strip().lower()
    password = d.get("password") or ""

    with pool.acquire() as conn:
        cur = conn.cursor()
        user_id = cur.var(int)
        result = cur.var(str)
        cur.callproc("login_user", [email, hash_password(password), user_id, result])
        success, _ = split_result(result.getvalue())
        if not success:
            return fail("Email or password is not correct.")
        return ok(user=public_user(cur, int(user_id.getvalue())))


@app.get("/api/users/<int:user_id>")
def get_user(user_id):
    with pool.acquire() as conn:
        return ok(data=public_user(conn.cursor(), user_id))


@app.put("/api/users/<int:user_id>")
def update_user(user_id):
    d = request.get_json(silent=True) or {}
    name = (d.get("FullName") or "").strip()
    address = (d.get("Address") or "").strip()
    phone, phone_error = clean_phone(d.get("PhoneNo"))
    if not 2 <= len(name) <= 100:
        return fail("Enter your full name (2 to 100 characters).")
    if phone_error:
        return fail(phone_error)
    if len(address) > 200:
        return fail("Address can be at most 200 characters.")

    with pool.acquire() as conn:
        cur = conn.cursor()
        result = cur.var(str)
        cur.callproc("update_user", [user_id, name, None, phone, address or None, None, result])
        success, msg = split_result(result.getvalue())
        if not success:
            return fail(msg)
        return ok(user=public_user(cur, user_id))


# ------------------------------------------------------------------
# WALLET   (add_money_ex, get_held_amount)
# ------------------------------------------------------------------
@app.get("/api/users/<int:user_id>/wallet")
def get_wallet(user_id):
    with pool.acquire() as conn:
        rows = query(conn.cursor(), """
            SELECT w.TransactionID, w.UserID, u.WalletBalance, w.TransactionType,
                   w.TransactionDate, w.Status, get_held_amount(w.UserID, NULL) AS Held
            FROM   Wallet w JOIN Users u ON u.UserID = w.UserID
            WHERE  w.UserID = :u""", u=user_id)
        if not rows:
            return ok(data=None)
        w = rows[0]
        held = w.pop("Held")
        w.update(held=held, available=w["WalletBalance"] - held,
                 hasTransaction=w["TransactionType"] is not None)
        return ok(data=w)


@app.post("/api/wallet/add")
def wallet_add():
    d = request.get_json(silent=True) or {}
    try:
        user_id = int(d.get("user_id"))
        amount = round(float(d.get("amount")), 2)
    except (TypeError, ValueError):
        return fail("Enter an amount greater than 0.")
    if amount <= 0:
        return fail("Enter an amount greater than 0.")
    if amount > MAX_TOP_UP:
        return fail("You can add at most Rs %s at a time." % format(MAX_TOP_UP, ","))
    outcome = "Success"

    with pool.acquire() as conn:
        cur = conn.cursor()
        result = cur.var(str)
        cur.callproc("add_money_ex", [user_id, amount, outcome, result])
        success, msg = split_result(result.getvalue())
        if not success:
            return fail(msg)
        return ok(balance=public_user(cur, user_id)["WalletBalance"])


# ------------------------------------------------------------------
# BROWSING AUCTIONS   (search, filters, sort: all done by Oracle)
# ------------------------------------------------------------------
SORTS = {
    "ending": "EndTime ASC",
    "price-low": "CurrentHighestBid ASC",
    "price-high": "CurrentHighestBid DESC",
    "bids": "BidCount DESC, EndTime ASC",
    "newest": "AuctionID DESC",
}


@app.get("/api/auctions")
def list_auctions():
    a = request.args
    where, binds = ["1 = 1"], {}
    if a.get("tab") == "closed":
        where.append("Phase IN ('ended', 'cancelled')")
    elif a.get("tab") == "open":
        where.append("Phase IN ('live', 'upcoming')")
    if a.get("category"):
        where.append("Category = :cat"); binds["cat"] = a["category"]
    if a.get("condition"):
        where.append("Condition = :cond"); binds["cond"] = a["condition"]
    if a.get("min", type=float) is not None:
        where.append("CurrentHighestBid >= :pmin"); binds["pmin"] = a.get("min", type=float)
    if a.get("max", type=float) is not None:
        where.append("CurrentHighestBid <= :pmax"); binds["pmax"] = a.get("max", type=float)
    if a.get("q"):
        where.append("LOWER(ItemName || ' ' || NVL(Description, ' ') || ' ' || Category "
                     "|| ' ' || Condition) LIKE :qtext")
        binds["qtext"] = "%" + a["q"].lower() + "%"

    order = "EndTime DESC" if a.get("tab") == "closed" else SORTS.get(a.get("sort"), SORTS["ending"])
    sql = "SELECT * FROM v_auction_detail WHERE " + " AND ".join(where) + " ORDER BY " + order
    with pool.acquire() as conn:
        return ok(data=[shape_auction(r) for r in query(conn.cursor(), sql, **binds)])


@app.get("/api/auctions/<int:auction_id>")
def auction_room(auction_id):
    """One auction plus its bid history. ?viewer=<userId> decides whose Rejected bids show."""
    viewer = request.args.get("viewer", type=int)
    with pool.acquire() as conn:
        cur = conn.cursor()
        rows = query(cur, "SELECT * FROM v_auction_detail WHERE AuctionID = :a", a=auction_id)
        if not rows:
            return ok(data=None)
        bids = query(cur, """
            SELECT b.BidID, b.AuctionID, b.ItemID, b.UserID, b.WinningUserID, b.BidAmount,
                   b.BidTime, b.Status, u.FullName AS BidderFullName
            FROM   Bids b JOIN Users u ON b.UserID = u.UserID
            WHERE  b.AuctionID = :a AND (b.Status = 'Accepted' OR b.UserID = :v)
            ORDER  BY b.BidTime DESC, b.BidID DESC""", a=auction_id, v=viewer)
        for b in bids:
            full = b.pop("BidderFullName")
            b["bidderName"] = "You" if b["UserID"] == viewer else short_name(full)

        wallet = None
        if viewer:
            w = query(cur, """
                SELECT WalletBalance, get_held_amount(UserID, :a) AS Held
                FROM   Users WHERE UserID = :v""", a=auction_id, v=viewer)
            if w:
                wallet = {"balance": w[0]["WalletBalance"], "held": w[0]["Held"],
                          "available": w[0]["WalletBalance"] - w[0]["Held"]}
        return ok(data={"auction": shape_auction(rows[0]), "bids": bids, "wallet": wallet})


@app.get("/api/home")
def home_data():
    with pool.acquire() as conn:
        live = [shape_auction(r) for r in query(
            conn.cursor(), "SELECT * FROM v_auction_detail WHERE Phase = 'live' ORDER BY EndTime")]
    featured = sorted(live, key=lambda x: -x["bidCount"])[0] if live else None
    return ok(data={"featured": featured, "endingSoon": live[:4], "liveCount": len(live)})


# ------------------------------------------------------------------
# BIDDING   (place_bid: the rules and the Accepted/Rejected record are in Oracle)
# ------------------------------------------------------------------
@app.post("/api/bids")
def place_bid():
    d = request.get_json(silent=True) or {}
    try:
        auction_id = int(d.get("auction_id"))
        user_id = int(d.get("user_id"))
        amount = round(float(d.get("amount")), 2)
    except (TypeError, ValueError):
        return fail("Enter a bid amount greater than 0.")

    with pool.acquire() as conn:
        cur = conn.cursor()
        result = cur.var(str)
        cur.callproc("place_bid", [auction_id, user_id, amount, result])
        success, msg = split_result(result.getvalue())

    if success:
        return ok(message=msg)
    return fail(msg, rejected=True)


@app.get("/api/users/<int:user_id>/bids")
def get_my_bids(user_id):
    with pool.acquire() as conn:
        return ok(data=my_bids(conn.cursor(), user_id))


# ------------------------------------------------------------------
# SELLING   (add_item, create_auction, cancel_auction)
# ------------------------------------------------------------------
ITEM_COLUMNS = ("SELECT ItemID, SellerID, ItemName, Description, Category, Condition, "
                "StartingPrice, CreatedAt FROM Items ")


@app.post("/api/items")
def create_item():
    d = request.get_json(silent=True) or {}
    try:
        user_id = int(d.get("user_id"))
        price = round(float(d.get("StartingPrice")), 2)
    except (TypeError, ValueError):
        return fail("Starting price must be greater than 0.")

    name = (d.get("ItemName") or "").strip()
    desc = (d.get("Description") or "").strip()
    category = (d.get("Category") or "").strip()

    if not name or len(name) > 100:
        return fail("Enter an item name (up to 100 characters).")
    if not category or len(category) > 50:
        return fail("Choose a category.")
    if d.get("Condition") not in CONDITIONS:
        return fail("Choose the condition.")
    if len(desc) > 300:
        return fail("Description can be at most 300 characters.")
    if price <= 0:
        return fail("Starting price must be greater than 0.")

    with pool.acquire() as conn:
        cur = conn.cursor()
        item_id = cur.var(int)
        result = cur.var(str)
        cur.callproc("add_item", [user_id, name, desc or None, category, d["Condition"],
                                  price, item_id, result])
        success, msg = split_result(result.getvalue())
        if not success:
            return fail(msg)
        return ok(item=query(cur, ITEM_COLUMNS + "WHERE ItemID = :i", i=int(item_id.getvalue()))[0])


@app.get("/api/users/<int:user_id>/listable-items")
def listable_items(user_id):
    """The seller's items that have no auction yet (one auction per item, as in the ER diagram)."""
    with pool.acquire() as conn:
        return ok(data=query(conn.cursor(), ITEM_COLUMNS + """
            i WHERE i.SellerID = :u
              AND NOT EXISTS (SELECT 1 FROM Auctions a WHERE a.ItemID = i.ItemID)
            ORDER BY i.ItemID""", u=user_id))


@app.get("/api/users/<int:user_id>/items")
def my_items(user_id):
    """My items, each with its most recent auction (if any)."""
    with pool.acquire() as conn:
        cur = conn.cursor()
        items = query(cur, ITEM_COLUMNS + "WHERE SellerID = :u ORDER BY ItemID DESC", u=user_id)
        by_item = {}
        for r in query(cur, "SELECT * FROM v_auction_detail WHERE SellerID = :u ORDER BY AuctionID DESC", u=user_id):
            by_item.setdefault(r["ItemID"], []).append(shape_auction(r))
        return ok(data=[{"item": it,
                         "auction": by_item[it["ItemID"]][0] if it["ItemID"] in by_item else None,
                         "auctionCount": len(by_item.get(it["ItemID"], []))} for it in items])


@app.post("/api/auctions")
def create_auction():
    d = request.get_json(silent=True) or {}
    try:
        user_id = int(d.get("user_id"))
        item_id = int(d.get("ItemID"))
        price = round(float(d.get("StartingPrice")), 2)
        start, end = parse_time(d.get("StartTime")), parse_time(d.get("EndTime"))
    except (TypeError, ValueError):
        return fail("Choose a start and end time, and a starting price greater than 0.")

    with pool.acquire() as conn:
        cur = conn.cursor()
        auction_id = cur.var(int)
        result = cur.var(str)
        cur.callproc("create_auction", [user_id, item_id, price, start, end, auction_id, result])
        success, msg = split_result(result.getvalue())
        if not success:
            return fail(msg)
        return ok(auction={"AuctionID": int(auction_id.getvalue())})


@app.post("/api/auctions/<int:auction_id>/cancel")
def cancel_auction(auction_id):
    d = request.get_json(silent=True) or {}
    try:
        user_id = int(d.get("user_id"))
    except (TypeError, ValueError):
        return fail("Log in again to cancel an auction.")
    with pool.acquire() as conn:
        cur = conn.cursor()
        result = cur.var(str)
        cur.callproc("cancel_auction", [auction_id, user_id, result])
        success, msg = split_result(result.getvalue())
        return ok() if success else fail(msg)


# ------------------------------------------------------------------
# DASHBOARD
# ------------------------------------------------------------------
@app.get("/api/users/<int:user_id>/dashboard")
def dashboard(user_id):
    with pool.acquire() as conn:
        cur = conn.cursor()
        mine = [shape_auction(r) for r in query(
            cur, "SELECT * FROM v_auction_detail WHERE SellerID = :u ORDER BY AuctionID DESC", u=user_id)]
        items_listed = query(cur, "SELECT COUNT(*) AS N FROM Items WHERE SellerID = :u", u=user_id)[0]["N"]
        bids_on_mine = query(cur, """
            SELECT * FROM (
              SELECT b.BidID, b.BidAmount, b.BidTime, u.FullName AS BidderFullName, i.ItemName
              FROM   Bids b
              JOIN   Auctions a ON b.AuctionID = a.AuctionID
              JOIN   Items i    ON a.ItemID    = i.ItemID
              JOIN   Users u    ON b.UserID    = u.UserID
              WHERE  b.Status = 'Accepted' AND i.SellerID = :u
              ORDER  BY b.BidTime DESC, b.BidID DESC
            ) WHERE ROWNUM <= 6""", u=user_id)
        standings = [b["standing"] for b in my_bids(cur, user_id)]

    sold = [a for a in mine if a["phase"] == "ended" and a["WinningUserID"]]
    return ok(data={
        "itemsListed": items_listed,
        "liveAuctions": sum(1 for a in mine if a["phase"] in ("live", "upcoming")),
        "soldCount": len(sold),
        "earnings": sum(a["CurrentHighestBid"] for a in sold),
        "bidsReceived": sum(a["bidCount"] for a in mine),
        "activeBids": standings.count("Winning"),
        "wonCount": standings.count("Won"),
        "recentAuctions": mine[:6],
        "bidsOnMine": [{"BidID": b["BidID"], "BidAmount": b["BidAmount"], "BidTime": b["BidTime"],
                        "bidderName": short_name(b["BidderFullName"]), "itemName": b["ItemName"]}
                       for b in bids_on_mine],
    })


# ------------------------------------------------------------------
# RECORDS MANAGER   (the CRUD screen: create / retrieve / search / update / delete
# on each of the five tables). Every write calls a procedure from 02_procedures.sql,
# so the same rules and constraints apply as everywhere else on the site.
# ------------------------------------------------------------------
RECORDS = {
    "users": {
        "pk": "UserID", "order": "UserID",
        "sql": "SELECT UserID, FullName, Email, PhoneNo, WalletBalance, DateJoined, Address FROM Users",
        "text": "LOWER(FullName || ' ' || Email || ' ' || NVL(PhoneNo, ' ') || ' ' || NVL(Address, ' '))",
    },
    "items": {
        "pk": "i.ItemID", "order": "i.ItemID",
        "sql": """SELECT i.ItemID, i.SellerID, u.FullName AS SellerName, i.ItemName, i.Description,
                         i.Category, i.Condition, i.StartingPrice, i.CreatedAt
                  FROM Items i JOIN Users u ON u.UserID = i.SellerID""",
        "text": """LOWER(i.ItemName || ' ' || NVL(i.Description, ' ') || ' ' || i.Category || ' '
                         || NVL(i.Condition, ' ') || ' ' || u.FullName)""",
    },
    "auctions": {
        "pk": "AuctionID", "order": "AuctionID",
        "sql": """SELECT AuctionID, ItemID, ItemName, SellerID, WinningUserID, WinnerFullName,
                         StartingPrice, CurrentHighestBid, StartTime, EndTime, Status, Phase
                  FROM v_auction_detail""",
        "text": "LOWER(ItemName || ' ' || SellerFullName || ' ' || NVL(WinnerFullName, ' ') || ' ' || Status || ' ' || Phase)",
    },
    "bids": {
        "pk": "b.BidID", "order": "b.BidID",
        "sql": """SELECT b.BidID, b.AuctionID, b.ItemID, i.ItemName, b.UserID, u.FullName AS BidderName,
                         b.WinningUserID, b.BidAmount, b.BidTime, b.Status
                  FROM Bids b JOIN Items i ON i.ItemID = b.ItemID JOIN Users u ON u.UserID = b.UserID""",
        "text": "LOWER(i.ItemName || ' ' || u.FullName || ' ' || NVL(b.Status, ' '))",
    },
    "wallet": {
        "pk": "w.TransactionID", "order": "w.TransactionID",
        "sql": """SELECT w.TransactionID, w.UserID, u.FullName AS OwnerName, u.WalletBalance,
                         w.TransactionType, w.TransactionDate, w.Status
                  FROM Wallet w JOIN Users u ON u.UserID = w.UserID""",
        "text": "LOWER(u.FullName || ' ' || NVL(w.TransactionType, ' ') || ' ' || NVL(w.Status, ' '))",
    },
}


class Bad(Exception):
    """A validation message to show the user."""


def run(cur, proc, *args):
    """Call a procedure whose LAST parameter is the OUT result text. Returns (success, message)."""
    result = cur.var(str)
    cur.callproc(proc, list(args) + [result])
    return split_result(result.getvalue())


def need_int(d, key, label):
    try:
        return int(d.get(key))
    except (TypeError, ValueError):
        raise Bad("Choose %s." % label)


def need_money(d, key, label):
    try:
        v = round(float(d.get(key)), 2)
    except (TypeError, ValueError):
        raise Bad("Enter %s." % label)
    if v <= 0:
        raise Bad("%s must be greater than 0." % label.capitalize())
    return v


def need_time(d, key, label):
    try:
        return parse_time(d.get(key))
    except (TypeError, ValueError):
        raise Bad("Choose %s." % label)


def user_fields(d, password_required):
    """Validate the Users columns. Returns a dict of clean values."""
    name = (d.get("FullName") or "").strip()
    email = (d.get("Email") or "").strip().lower()
    address = (d.get("Address") or "").strip()
    password = d.get("Password") or ""
    phone, phone_error = clean_phone(d.get("PhoneNo"))
    if not 2 <= len(name) <= 100:
        raise Bad("Enter the full name (2 to 100 characters).")
    if not EMAIL_RE.match(email) or len(email) > 100:
        raise Bad("Enter a valid email address.")
    if phone_error:
        raise Bad(phone_error)
    if len(address) > 200:
        raise Bad("Address can be at most 200 characters.")
    if password or password_required:
        if len(password) < 8 or not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
            raise Bad("Password needs at least 8 characters with a letter and a number.")
    return {"name": name, "email": email, "phone": phone, "address": address or None,
            "password": hash_password(password) if password else None}


def item_fields(d):
    name = (d.get("ItemName") or "").strip()
    desc = (d.get("Description") or "").strip()
    category = (d.get("Category") or "").strip()
    if not name or len(name) > 100:
        raise Bad("Enter an item name (up to 100 characters).")
    if not category or len(category) > 50:
        raise Bad("Enter a category (up to 50 characters).")
    if d.get("Condition") not in CONDITIONS:
        raise Bad("Choose the condition.")
    if len(desc) > 300:
        raise Bad("Description can be at most 300 characters.")
    return {"name": name, "desc": desc or None, "category": category, "condition": d["Condition"],
            "price": need_money(d, "StartingPrice", "the starting price")}


# ---------- INSERT ----------
def insert_users(cur, d):
    f = user_fields(d, True)
    uid = cur.var(int)
    result = cur.var(str)
    cur.callproc("register_user", [f["name"], f["email"], f["password"], f["phone"], f["address"], uid, result])
    success, msg = split_result(result.getvalue())
    if not success:
        return False, msg
    opening = d.get("WalletBalance")
    if opening not in (None, "", 0, "0"):
        run(cur, "add_money", int(uid.getvalue()), need_money(d, "WalletBalance", "the opening balance"))
    return True, "User added. The trigger created their wallet row."


def insert_items(cur, d):
    f = item_fields(d)
    item_id = cur.var(int)
    result = cur.var(str)
    cur.callproc("add_item", [need_int(d, "SellerID", "the seller"), f["name"], f["desc"], f["category"],
                              f["condition"], f["price"], item_id, result])
    return split_result(result.getvalue())


def insert_auctions(cur, d):
    item_id = need_int(d, "ItemID", "an item")
    price = need_money(d, "StartingPrice", "the starting price")
    start, end = need_time(d, "StartTime", "the start time"), need_time(d, "EndTime", "the end time")
    rows = query(cur, "SELECT SellerID FROM Items WHERE ItemID = :i", i=item_id)
    if not rows:
        return False, "Item not found."
    auction_id = cur.var(int)
    result = cur.var(str)
    cur.callproc("create_auction", [rows[0]["SellerID"], item_id, price, start, end, auction_id, result])
    return split_result(result.getvalue())


def insert_bids(cur, d):
    return run(cur, "place_bid", need_int(d, "AuctionID", "an auction"), need_int(d, "UserID", "the bidder"),
               need_money(d, "BidAmount", "the bid amount"))


def insert_wallet(cur, d):
    return run(cur, "create_wallet", need_int(d, "UserID", "a user"))


# ---------- UPDATE ----------
def update_users(cur, rid, d):
    f = user_fields(d, False)
    return run(cur, "update_user", rid, f["name"], f["email"], f["phone"], f["address"], f["password"])


def update_items(cur, rid, d):
    f = item_fields(d)
    return run(cur, "update_item", rid, f["name"], f["desc"], f["category"], f["condition"], f["price"])


def update_auctions(cur, rid, d):
    return run(cur, "update_auction", rid, need_money(d, "StartingPrice", "the starting price"),
               need_time(d, "StartTime", "the start time"), need_time(d, "EndTime", "the end time"))


def update_bids(cur, rid, d):
    return run(cur, "update_bid", rid, need_money(d, "BidAmount", "the new bid amount"))


def update_wallet(cur, rid, d):
    rows = query(cur, "SELECT UserID FROM Wallet WHERE TransactionID = :t", t=rid)
    if not rows:
        return False, "Wallet not found."
    amount = need_money(d, "Amount", "the amount")
    kind = d.get("TransactionType")
    if kind == "Credit":
        return run(cur, "add_money", rows[0]["UserID"], amount)
    if kind == "Debit":
        return run(cur, "withdraw_money", rows[0]["UserID"], amount)
    raise Bad("Choose Credit (add money) or Debit (withdraw).")


INSERTERS = {"users": insert_users, "items": insert_items, "auctions": insert_auctions,
             "bids": insert_bids, "wallet": insert_wallet}
UPDATERS = {"users": update_users, "items": update_items, "auctions": update_auctions,
            "bids": update_bids, "wallet": update_wallet}
DELETERS = {"users": "delete_user", "items": "delete_item", "auctions": "delete_auction",
            "bids": "delete_bid", "wallet": "delete_wallet"}


def known_table(table):
    if table not in RECORDS:
        raise Bad("Unknown table.")


@app.errorhandler(Bad)
def bad_input(e):
    return fail(str(e))


@app.get("/api/records/<table>")
def records_list(table):
    """RETRIEVE all rows, or SEARCH them with ?q=  (a number also matches the ID)."""
    known_table(table)
    cfg = RECORDS[table]
    q = (request.args.get("q") or "").strip()
    where, binds = "", {}
    if q:
        conds = [cfg["text"] + " LIKE :qtext"]
        binds["qtext"] = "%" + q.lower() + "%"
        if q.isdigit() and len(q) <= 12:
            conds.append(cfg["pk"] + " = :qid")
            binds["qid"] = int(q)
        where = " WHERE (" + " OR ".join(conds) + ")"
    sql = cfg["sql"] + where + " ORDER BY " + cfg["order"] + " FETCH FIRST 500 ROWS ONLY"
    with pool.acquire() as conn:
        return ok(data=query(conn.cursor(), sql, **binds))


@app.post("/api/records/<table>")
def records_create(table):
    known_table(table)
    d = request.get_json(silent=True) or {}
    with pool.acquire() as conn:
        success, msg = INSERTERS[table](conn.cursor(), d)
    return ok(message=msg) if success else fail(msg)


@app.put("/api/records/<table>/<int:rid>")
def records_update(table, rid):
    known_table(table)
    d = request.get_json(silent=True) or {}
    with pool.acquire() as conn:
        success, msg = UPDATERS[table](conn.cursor(), rid, d)
    return ok(message=msg) if success else fail(msg)


@app.delete("/api/records/<table>/<int:rid>")
def records_delete(table, rid):
    known_table(table)
    with pool.acquire() as conn:
        success, msg = run(conn.cursor(), DELETERS[table], rid)
    return ok(message=msg) if success else fail(msg)


@app.post("/api/records/auctions/<int:rid>/cancel")
def records_cancel_auction(rid):
    """UPDATE an auction's Status to Cancelled (cancel_auction checks the rules)."""
    with pool.acquire() as conn:
        cur = conn.cursor()
        rows = query(cur, "SELECT SellerID FROM v_auction_detail WHERE AuctionID = :a", a=rid)
        if not rows:
            return fail("Auction not found.")
        success, msg = run(cur, "cancel_auction", rid, rows[0]["SellerID"])
    return ok(message=msg) if success else fail(msg)


# ------------------------------------------------------------------
if __name__ == "__main__":
    try:
        ip = socket.gethostbyname(socket.gethostname())
    except OSError:
        ip = "your-laptop-ip"
    print("\nBidForge is running.")
    print("  On this laptop :  http://localhost:5000")
    print("  For teammates  :  http://%s:5000   (same Wi-Fi)\n" % ip)
    app.run(host="0.0.0.0", port=5000, debug=False)
