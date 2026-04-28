# salonrink-sync-bot

SALON BOARDの予約データを15分ごとに自動で取得し、Supabaseに同期するCronボット。

## 概要

- **実行**: Railway cron job（15分ごと）
- **機能**: SALON BOARDの予約データ自動同期
- **セキュリティ**: AES-256-GCM 暗号化された認証情報を復号
- **エラー検知**: 3回連続失敗時にOsamuへLINE通知
- **レジリエンス**: ランダムジッター + UserAgent ローテーション

## セットアップ

### 環境変数

`.env` ファイルを作成し、以下を設定：

```bash
SUPABASE_URL=https://fmpmgilgvvfezursmyic.supabase.co
SUPABASE_SERVICE_KEY=<your-service-role-key>
ENCRYPTION_KEY=b5907960d381532624b595546dca17324927207ad85f7f89a8021b45bec75361
LINE_CHANNEL_ACCESS_TOKEN=<your-line-token>
OSAMU_LINE_USER_ID=<osamu-user-id>
```

### インストール

```bash
npm install
npm run build
```

### ローカルテスト（Cron）

```bash
npm run dev
```

### Express サーバーのローカルテスト

```bash
npm run dev:server
# 別のターミナルで
curl -X POST http://localhost/sync \
  -H "Authorization: Bearer your-sync-api-key" \
  -H "Content-Type: application/json" \
  -d '{"salon_id":"salon-123"}'
```

## Express サーバーのデプロイ

### VPS（ConoHa Tokyo など）

#### 1. Docker でデプロイ

```bash
docker build -t salonrink-sync-bot .
docker run -d \
  --name salonrink-sync \
  -p 80:80 \
  -e SUPABASE_URL=https://fmpmgilgvvfezursmyic.supabase.co \
  -e SUPABASE_SERVICE_KEY=<your-key> \
  -e ENCRYPTION_KEY=<your-key> \
  -e SYNC_API_KEY=<secure-api-key> \
  -e PORT=80 \
  salonrink-sync-bot
```

#### 2. systemd サービス化（非Docker）

**/etc/systemd/system/salonrink-sync.service**:

```ini
[Unit]
Description=SalonRink HPB Sync Server
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/app/salonrink-sync-bot
ExecStart=/usr/bin/node /app/salonrink-sync-bot/dist/server.js
Restart=on-failure
RestartSec=10
StandardOutput=append:/var/log/salonrink-sync.log
StandardError=append:/var/log/salonrink-sync.log

Environment="NODE_ENV=production"
Environment="PORT=80"
Environment="SUPABASE_URL=https://fmpmgilgvvfezursmyic.supabase.co"
Environment="SUPABASE_SERVICE_KEY=<your-key>"
Environment="ENCRYPTION_KEY=<your-key>"
Environment="SYNC_API_KEY=<secure-api-key>"

[Install]
WantedBy=multi-user.target
```

起動コマンド:
```bash
sudo systemctl daemon-reload
sudo systemctl enable salonrink-sync
sudo systemctl start salonrink-sync
sudo systemctl status salonrink-sync
```

ログ確認:
```bash
sudo journalctl -u salonrink-sync -f
# または
tail -f /var/log/salonrink-sync.log
```

#### 3. pm2 での管理

**ecosystem.config.js**:

```javascript
module.exports = {
  apps: [
    {
      name: 'salonrink-sync',
      script: './dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 80,
        SUPABASE_URL: 'https://fmpmgilgvvfezursmyic.supabase.co',
        SUPABASE_SERVICE_KEY: '<your-key>',
        ENCRYPTION_KEY: '<your-key>',
        SYNC_API_KEY: '<secure-api-key>',
      },
      error_file: '/var/log/salonrink-sync-error.log',
      out_file: '/var/log/salonrink-sync.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
```

起動コマンド:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Railway でのデプロイ（Cron）

Railway は自動デプロイをサポート。既存の railway.json 設定を使用:

```bash
railway link          # プロジェクトをリンク
railway up            # デプロイ
railway logs          # ログ表示
```

## Nginx リバースプロキシ設定（推奨）

Express を直接ポート 80 で実行する代わりに、Nginx 経由で使用:

**/etc/nginx/sites-available/salonrink-sync**:

```nginx
server {
    listen 80;
    server_name 160.251.213.197;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
}
```

有効化:
```bash
sudo ln -s /etc/nginx/sites-available/salonrink-sync /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Express をポート 5000 で実行:
```bash
PORT=5000 npm run start:server
```

## Railway デプロイ

```bash
railway link          # プロジェクトをリンク
railway up            # デプロイ
railway logs          # ログ表示
```

## ファイル構成

| ファイル | 説明 |
|---------|------|
| `src/crypto.ts` | AES-256-GCM 暗号化・復号化 |
| `src/supabase.ts` | Supabase admin client + DB操作 |
| `src/scraper.ts` | Playwright スクレイパー |
| `src/notify.ts` | LINE push通知 |
| `src/index.ts` | Railway cron メインループ |
| `src/server.ts` | Express HTTP サーバー（VPS Web API） |
| `railway.json` | Railway cron設定 |

## 動作フロー

### Railway Cron（自動同期）
1. **ジッター**: 0〜30秒ランダム待機
2. **認証取得**: `salon_hpb_credentials` テーブルから取得
3. **復号化**: AES-256-GCMで認証情報を復号
4. **スクレイピング**: Playwright で SALON BOARD にログイン
5. **データ取得**: 今日〜30日後の予約一覧を取得
6. **保存**: `hpb_reservations` テーブルにupsert
7. **ステータス更新**: `sync_status` テーブルを更新

### Express HTTP サーバー（手動同期）
1. **リクエスト受信**: `/sync` エンドポイントで POST リクエスト受け入れ
2. **API認証**: `Authorization: Bearer <SYNC_API_KEY>` を検証
3. **salon_id 取得**: リクエストボディから salon_id を抽出
4. **認証情報復号**: `salon_hpb_credentials` から認証情報を復号
5. **スクレイピング実行**: 既存の scrapeReservations() 関数を実行
6. **データ保存**: 予約データを Supabase に upsert
7. **レスポンス返却**: 同期結果を JSON で返却

## エラーハンドリング

- **失敗1回目、2回目**: ログに出力、ステータスは `healthy` 維持
- **失敗3回目**: ステータスを `unhealthy` に変更、Osamuへ LINE 通知

## Supabase テーブル（前提）

### salon_hpb_credentials
```
id, salon_id, hpb_login_id_enc, hpb_password_enc, hpb_salon_id
```

### hpb_reservations
```
id, salon_id, hpb_reservation_id (unique), guest_name, menu_name,
start_at, end_at, status, raw_data, synced_at
```

### sync_status
```
id, salon_id (unique), status ('healthy'|'unhealthy'|'maintenance'),
last_sync_at, last_error, consecutive_failures, updated_at
```

## API エンドポイント仕様

### `GET /`（ヘルスチェック）

リクエスト:
```bash
curl http://160.251.213.197/
```

レスポンス（200 OK）:
```json
{
  "status": "ok",
  "timestamp": "2026-04-28T12:34:56.000Z"
}
```

### `POST /sync`（同期実行）

リクエスト:
```bash
curl -X POST http://160.251.213.197/sync \
  -H "Authorization: Bearer <SYNC_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"salon_id":"salon-123"}'
```

リクエストボディ:
```json
{
  "salon_id": "salon-123"
}
```

レスポンス（200 OK）:
```json
{
  "success": true,
  "salon_id": "salon-123",
  "hpb_salon_id": "12345",
  "reservations_count": 5,
  "synced_at": "2026-04-28T12:34:56.000Z"
}
```

エラーレスポンス（400）:
```json
{
  "error": "Missing or invalid salon_id"
}
```

エラーレスポンス（401）:
```json
{
  "error": "Invalid API key"
}
```

エラーレスポンス（404）:
```json
{
  "error": "Salon not found or credentials not configured"
}
```

エラーレスポンス（500）:
```json
{
  "success": false,
  "salon_id": "salon-123",
  "error": "Sync failed: SALON BOARD login error",
  "synced_at": "2026-04-28T12:34:56.000Z"
}
```

## トラブルシューティング

| 症状 | 原因 | 対応 |
|---|---|---|
| `Connection refused` | サーバー未起動 | `npm run start:server` または systemd を確認 |
| `401 Unauthorized` | API キー誤り | `SYNC_API_KEY` 環境変数を確認 |
| `404 Salon not found` | salon_id 存在しない | Supabase に credentials が登録されているか確認 |
| `Timeout` | スクレイピングが長い | ネットワーク遅延またはSALON BOARD が応答遅い |
| `SALON BOARD ログイン失敗` | 認証情報誤り | 復号化ロジック、ENCRYPTION_KEY を確認 |

## 注意事項

- **SALON BOARD セレクタ**: `src/scraper.ts` のセレクタは推定値です。実際のHTML構造に合わせて調整が必要な場合があります。
- **Railway**: Playwright は `--no-sandbox` で実行されます（Linux環境対応）。
- **暗号化**: `ENCRYPTION_KEY` は32バイト（64文字hex）である必要があります。
- **ポート**: Express は デフォルトでポート 80 でリッスンします。`PORT` 環境変数で変更可能。

## ライセンス

Private
