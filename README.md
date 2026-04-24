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

### ローカルテスト

```bash
npm run dev
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
| `src/index.ts` | メインループ |
| `railway.json` | Railway cron設定 |

## 動作フロー

1. **ジッター**: 0〜30秒ランダム待機
2. **認証取得**: `salon_hpb_credentials` テーブルから取得
3. **復号化**: AES-256-GCMで認証情報を復号
4. **スクレイピング**: Playwright で SALON BOARD にログイン
5. **データ取得**: 今日〜30日後の予約一覧を取得
6. **保存**: `hpb_reservations` テーブルにupsert
7. **ステータス更新**: `sync_status` テーブルを更新

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

## 注意事項

- **SALON BOARD セレクタ**: `src/scraper.ts` のセレクタは推定値です。実際のHTML構造に合わせて調整が必要な場合があります。
- **Railway**: Playwright は `--no-sandbox` で実行されます（Linux環境対応）。
- **暗号化**: `ENCRYPTION_KEY` は32バイト（64文字hex）である必要があります。

## ライセンス

Private
