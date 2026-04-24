# Railway デプロイ手順

## 前提条件

- Railway CLI がインストールされていること
- GitHub アカウントでログイン可能なこと
- Supabase service role key が取得済み
- LINE Channel access token が取得済み

## デプロイ手順

### 1. Railway にログイン

```bash
cd ~/Documents/salonrink-sync-bot
railway login
```

ブラウザが開き、GitHub でログインします。

### 2. Railway プロジェクトを初期化

```bash
railway init
```

プロンプトが表示されます：
- **Project name**: `salonrink-sync-bot`
- **Choose plugins**: スキップ（Enter）

### 3. 環境変数を設定

以下のコマンドを実行して環境変数を設定します：

```bash
railway variables set SUPABASE_URL=https://fmpmgilgvvfezursmyic.supabase.co

railway variables set SUPABASE_SERVICE_KEY=<取得済みのservice_role_key>

railway variables set ENCRYPTION_KEY=b5907960d381532624b595546dca17324927207ad85f7f89a8021b45bec75361

railway variables set LINE_CHANNEL_ACCESS_TOKEN=<取得済みのLINE_CHANNEL_ACCESS_TOKEN>

railway variables set NODE_ENV=production
```

### 4. デプロイ実行

```bash
railway up
```

ビルドとデプロイが自動で進みます。

### 5. デプロイログを確認

```bash
railway logs
```

または Railway ダッシュボードで確認：
https://railway.app

## 環境変数の詳細

| 変数名 | 値 | 説明 |
|---|---|---|
| `SUPABASE_URL` | `https://fmpmgilgvvfezursmyic.supabase.co` | Supabase プロジェクトURL |
| `SUPABASE_SERVICE_KEY` | (service_role key) | Supabase service role キー |
| `ENCRYPTION_KEY` | `b5907960...` | AES-256-GCM 暗号化キー |
| `LINE_CHANNEL_ACCESS_TOKEN` | (LINE bot token) | LINE Messaging API チャネルアクセストークン |
| `NODE_ENV` | `production` | Node.js 環境（本番） |

**注**: `OSAMU_LINE_USER_ID` は後で設定可能です。

```bash
railway variables set OSAMU_LINE_USER_ID=<user_id>
```

## Cron Job 確認

`railway.json` に以下が設定されています：

```json
{
  "deploy": {
    "cronSchedule": "*/15 * * * *"
  }
}
```

**実行**: 15分ごと

## トラブルシューティング

### Playwright のインストール失敗

Railway で Playwright が正しくビルドされない場合：

```bash
# package.json のスクリプトを確認
cat package.json | grep -A 5 '"scripts"'

# Railway のビルドログを確認
railway logs --follow
```

### env 変数が読み込まれない

```bash
# 設定済みの環境変数を確認
railway variables

# 特定の変数を確認
railway variables list | grep SUPABASE_URL
```

## 本番環境での動作確認

1. Railway ダッシュボードでプロジェクトを開く
2. **Deployments** タブで最新デプロイのステータスを確認
3. **Logs** で実行ログを確認
4. Cron job が 15分ごとに実行されているか確認

```bash
# リアルタイムログを表示
railway logs --follow
```
