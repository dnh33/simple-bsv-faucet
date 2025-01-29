# Simple BSV Faucet

[![Netlify Status](https://api.netlify.com/api/v1/badges/bf1db314-b5b2-4c34-b78b-e28a23cc1410/deploy-status)](https://app.netlify.com/sites/push-the-btn/deploys)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, responsive Bitcoin SV (BSV) faucet built with React and TypeScript. Features a clean UI, bonus system, and rate limiting capabilities.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/dnh33/simple-bsv-faucet)

## Features

- 🎯 Clean, responsive UI
- 💎 Random bonus rewards system
- 🔒 Rate limiting capabilities
- 📝 Transaction metadata via OP_RETURN
- ⚡ Real-time balance updates
- 🔄 Automatic UTXO management

## Quick Start

### Deploy to Netlify

1. Click the "Deploy to Netlify" button above
2. Connect your GitHub account
3. Configure the following environment variables:
   ```env
   VITE_PRIVATE_KEY=your_private_key
   VITE_FAUCET_AMOUNT=1000
   VITE_BONUS_RANGE=500-2000
   VITE_FAUCET_IDENTIFIER=your_faucet_identifier
   ```

### Local Development

```bash
# Clone the repository
git clone https://github.com/dnh33/simple-bsv-faucet
cd simple-bsv-faucet

# Install dependencies
npm install

# Create and configure environment variables
cp .env.example .env

# Start development server
npm run dev
```

## Configuration

### Environment Variables

- `VITE_PRIVATE_KEY`: Your BSV private key in WIF format (Keep this secure!)
- `VITE_FAUCET_AMOUNT`: Base amount for each claim (in satoshis)
- `VITE_BONUS_RANGE`: Range for bonus rewards (format: "min-max")
- `VITE_FAUCET_IDENTIFIER`: Identifier added to OP_RETURN

### Rate Limiting

The faucet includes built-in rate limiting for specific addresses. Modify the delay in `src/App.tsx`:

```typescript
if (recipientAddress === "your_address") {
  setStatus("Processing claim...");
  await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 second delay
  throw new Error("This address is rate limited");
}
```

## Transaction Metadata

Each transaction includes OP_RETURN data with your faucet identifier:

```typescript
lockingScript: new Script([
  { op: OP.OP_FALSE },
  { op: OP.OP_RETURN },
  {
    op: OP.OP_PUSHDATA1,
    data: Array.from(new TextEncoder().encode(FAUCET_IDENTIFIER)),
  },
]);
```

## Security Considerations

⚠️ **Important Security Notes:**

1. Never expose your private key in client-side code in production
2. Consider implementing server-side rate limiting for production use
3. Test thoroughly on testnet before deploying to mainnet
4. Monitor your faucet balance and set up alerts

## Customization

### UI Theming

Modify `src/App.css` to customize the appearance:

```css
:root {
  --background: #13111c;
  --primary: #8b5cf6;
  --text: #ffffff;
  /* Add your custom variables */
}
```

### Bonus System

Adjust bonus probability and amounts in `src/utils/hooks.ts`:

```typescript
const BONUS_PROBABILITY = 0.05; // 5% chance
const BONUS_RANGE = [500, 2000]; // in satoshis
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you find this project helpful, consider donating to: `your_bsv_address`

---

Built with ❤️ for the Bitcoin community
