# Railway Environment Variables Configuration

## Required Environment Variables for Railway Deployment

Go to your Railway dashboard → Select your project → Variables tab → Add these:

### Database & Server

```
MONGODB_URI=your_mongodb_connection_string
PORT=4242
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d
```

### Email Configuration (CRITICAL FOR SENDING EMAILS)

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_EMAIL=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_SERVICE=gmail
FROM_NAME=Your Store Name
SEND_EMAILS=true
```

### Frontend URL (CRITICAL FOR RESET PASSWORD LINKS)

```
FRONTEND_URL=https://your-frontend-url.vercel.app
```

**Note**: Replace with your actual Vercel deployment URL

### Admin Configuration

```
ADMIN_EMAIL=your_admin@email.com
ADMIN_PASS=your_secure_admin_password
AUTO_CREATE_ADMIN=true
```

### Stripe Keys

```
STRIPE_SECRET_KEY=your_stripe_secret_key_here
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key_here
```

**Note**: Get your actual keys from Stripe Dashboard → Developers → API Keys

## Why Emails Are Not Sending

### Common Issues:

1. **Missing SEND_EMAILS=true** - If not set, emails won't send
2. **Missing SMTP credentials** - Gmail requires app password
3. **Wrong FRONTEND_URL** - Reset password links will be incorrect
4. **SMTP_PASS incorrect** - Use Gmail App Password, not regular password

## How to Add Variables in Railway:

1. Go to https://railway.app/dashboard
2. Select your backend project (nerozyserver-production)
3. Click on "Variables" tab
4. Click "New Variable" or "Raw Editor"
5. Paste all the variables above
6. Click "Save"
7. Railway will automatically redeploy your app

## Testing After Deployment:

### Test Password Reset Email:

```bash
curl -X POST https://nerozyserver-production.up.railway.app/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"balochfaheem462@gmail.com"}'
```

### Test Signup Email:

```bash
curl -X POST https://nerozyserver-production.up.railway.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"Test123"}'
```

## Check Railway Logs:

After adding variables and redeploying:

1. Go to Railway dashboard
2. Click on your project
3. Click "Deployments" tab
4. Click on the latest deployment
5. Check logs for:
   - `SMTP transporter ready` ✅ (Good - emails will work)
   - `SMTP transporter verification failed` ❌ (Bad - check SMTP credentials)
   - `SEND_EMAILS is false` ⚠️ (Emails disabled)

## Important Notes:

- **Never commit `.env` file to git** (already in .gitignore)
- Railway reads environment variables from its dashboard, NOT from .env file
- After adding/changing variables, Railway automatically redeploys
- FRONTEND_URL must be HTTPS for production (e.g., https://nerozy.vercel.app)
- For local development, keep using `http://localhost:5173`

## Gmail App Password Setup:

If you haven't already:

1. Go to https://myaccount.google.com/security
2. Enable 2-Step Verification
3. Go to https://myaccount.google.com/apppasswords
4. Create a new app password for "Mail"
5. Use that 16-character password as SMTP_PASS

## Verification Checklist:

- [ ] All environment variables added in Railway dashboard
- [ ] SEND_EMAILS=true is set
- [ ] SMTP credentials are correct (test with Gmail App Password)
- [ ] FRONTEND_URL points to your deployed frontend
- [ ] Railway shows successful deployment
- [ ] Railway logs show "SMTP transporter ready"
- [ ] Test forgot password from frontend
- [ ] Check email inbox for reset link
- [ ] Click link and verify it goes to correct frontend URL

## If Emails Still Don't Work:

1. Check Railway logs for SMTP errors
2. Verify Gmail App Password is correct
3. Try sending test email using curl command above
4. Check spam folder in email
5. Ensure Gmail account allows "Less secure app access" or uses App Password
