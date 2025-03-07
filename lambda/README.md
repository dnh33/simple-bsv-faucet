# BSV Faucet Lambda Function

This Lambda function powers the BSV faucet by handling transaction creation and broadcasting securely on the server side. It leverages the BSV Wallet Toolbox for efficient UTXO management and transaction handling.

## Setup Instructions

### 1. Create AWS Lambda Function

1. Log in to the AWS Management Console
2. Navigate to AWS Lambda
3. Click "Create function"
4. Select "Author from scratch"
5. Enter function name (e.g., "CreateClaim")
6. Select Node.js 18.x or later for the runtime
7. Click "Create function"

### 2. Configure Environment Variables

In the Lambda function configuration, add these environment variables:

- `FAUCET_PRIVATE_KEY`: Your BSV private key in WIF format
- `FAUCET_AMOUNT`: Amount of satoshis to send per request (default is 1)
- `FAUCET_IDENTIFIER`: Text for the OP_RETURN output (default is "BSV Faucet | Lambda")
- `MIN_TIME_BETWEEN_CLAIMS`: Minimum time in milliseconds between claims from the same address/IP (default is 3000, which is 3 seconds)

### 3. Deploy the Code

1. In the lambda directory, run:

```
npm install
```

2. Create a deployment package:

```
zip -r function.zip index.mjs package.json node_modules
```

3. Upload the zip file to AWS Lambda:
   - In the Lambda function page, click "Upload from" > ".zip file"
   - Select the function.zip file
   - Click "Save"

### 4. Configure API Gateway

1. Navigate to API Gateway in the AWS Console
2. Click "Create API"
3. Select "REST API" and click "Build"
4. Enter API name (e.g., "BSV Faucet API") and click "Create API"
5. Click "Create Resource" and enter "claim" as the resource name
6. For this resource, click "Create Method" and select "POST"
7. Configure the POST method:

   - Integration type: Lambda Function
   - Lambda Function: Select your faucet function
   - Click "Save"

8. Enable CORS for your resource:

   - Select the resource
   - Click "Actions" > "Enable CORS"
   - Keep default settings or customize as needed
   - Click "Enable CORS and replace existing CORS headers"

9. Deploy the API:

   - Click "Actions" > "Deploy API"
   - Create a new stage (e.g., "prod")
   - Click "Deploy"

10. Note your API Endpoint URL (you'll need this for the React app)

### 5. Update React App

Update the `LAMBDA_API_ENDPOINT` constant in `src/App.tsx` with your API Gateway URL.

## Key Features

### Efficient UTXO Management

- Uses the BSV Wallet Toolbox for UTXO handling
- Sorts UTXOs by value and uses the smallest ones first to minimize dust
- Adds appropriate change outputs back to the faucet address

### Interactive Rate Limiting

- Short 3-second wait time between claims for interactive user experience
- Countdown timer on the frontend for better user feedback
- Rate limiting by both address and IP address
- In-memory cache for recent claims
- Permanently rate-limited addresses are banned
- User-friendly error messages with time remaining

### Error Handling

- Comprehensive error checking at each step
- Detailed logging for troubleshooting
- User-friendly error messages

## Notes on ES Modules

This Lambda function uses ES Modules (`.mjs` extension) instead of CommonJS. This means:

- We use `import` instead of `require()`
- We use `export const handler` instead of `exports.handler`
- The package.json includes `"type": "module"`
- The main file is named `index.mjs`

## Security Considerations

- Never expose your private key in the front-end code
- Consider adding additional rate limiting and IP-based restrictions in API Gateway
- Monitor your Lambda function usage to control costs
- Consider using AWS DynamoDB for persistent rate limiting across Lambda cold starts
- Set appropriate IAM permissions for your Lambda function
