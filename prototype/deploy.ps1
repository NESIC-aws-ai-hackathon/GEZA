<#
.SYNOPSIS
    GEZA Prototype - CloudFormation Deployment Script
.DESCRIPTION
    Lambda + API Gateway (HTTP API) + S3 Website Hosting をデプロイします。
.PARAMETER StackName
    CloudFormation スタック名 (default: geza-prototype)
.PARAMETER Profile
    AWS CLI プロファイル (default: share)
.PARAMETER Region
    AWS リージョン (default: ap-northeast-1)
#>
param(
    [string]$StackName = "geza-prototype",
    [string]$Profile = "share",
    [string]$Region = "ap-northeast-1"
)

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-AwsResult {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $Step (exit code: $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n=== GEZA Prototype - CloudFormation Deploy ===" -ForegroundColor Cyan
Write-Host "Stack: $StackName | Profile: $Profile | Region: $Region"

# --------------------------------------------------
# 1. AWS 認証確認
# --------------------------------------------------
Write-Host "`n[1/6] Checking AWS credentials..." -ForegroundColor Yellow
$AccountId = aws sts get-caller-identity --profile $Profile --query "Account" --output text 2>&1
Test-AwsResult "AWS credentials check"
Write-Host "Account: $AccountId"

# --------------------------------------------------
# 2. デプロイ用 S3 バケット作成
# --------------------------------------------------
$DeployBucket = "geza-deploy-$AccountId"
Write-Host "`n[2/6] Preparing deployment bucket: $DeployBucket ..." -ForegroundColor Yellow
$null = aws s3api head-bucket --bucket $DeployBucket --profile $Profile 2>&1
if ($LASTEXITCODE -ne 0) {
    aws s3api create-bucket `
        --bucket $DeployBucket `
        --profile $Profile `
        --region $Region `
        --create-bucket-configuration LocationConstraint=$Region | Out-Null
    Test-AwsResult "Create deploy bucket"
    Write-Host "Created: s3://$DeployBucket"
} else {
    Write-Host "Exists:  s3://$DeployBucket"
}

# --------------------------------------------------
# 3. Lambda コードのパッケージ & アップロード
# --------------------------------------------------
Write-Host "`n[3/6] Packaging Lambda function..." -ForegroundColor Yellow
$Timestamp = Get-Date -Format "yyyyMMddHHmmss"
$LambdaS3Key = "lambda/chat-$Timestamp.zip"
$TempDir = Join-Path $env:TEMP "geza-lambda-$Timestamp"
$ZipFile = Join-Path $env:TEMP "geza-chat-$Timestamp.zip"

New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
Copy-Item (Join-Path (Join-Path $ScriptDir "backend") "lambda_function.py") $TempDir

Compress-Archive -Path "$TempDir\*" -DestinationPath $ZipFile -Force
aws s3 cp $ZipFile "s3://$DeployBucket/$LambdaS3Key" --profile $Profile --region $Region | Out-Null
Test-AwsResult "Upload Lambda package"
Write-Host "Uploaded: s3://$DeployBucket/$LambdaS3Key"

# cleanup temp
Remove-Item -Recurse -Force $TempDir
Remove-Item -Force $ZipFile

# --------------------------------------------------
# 4. CloudFormation デプロイ
# --------------------------------------------------
Write-Host "`n[4/6] Deploying CloudFormation stack..." -ForegroundColor Yellow
$TemplateFile = Join-Path $ScriptDir "cfn-template.yaml"

aws cloudformation deploy `
    --template-file $TemplateFile `
    --stack-name $StackName `
    --parameter-overrides "DeployBucketName=$DeployBucket" "LambdaS3Key=$LambdaS3Key" `
    --capabilities CAPABILITY_IAM `
    --profile $Profile `
    --region $Region `
    --no-fail-on-empty-changeset
Test-AwsResult "CloudFormation deploy"
Write-Host "Stack deployed successfully."

# --------------------------------------------------
# 5. スタック出力の取得
# --------------------------------------------------
Write-Host "`n[5/6] Retrieving stack outputs..." -ForegroundColor Yellow
$ApiUrl = aws cloudformation describe-stacks `
    --stack-name $StackName --profile $Profile --region $Region `
    --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text
$WebsiteUrl = aws cloudformation describe-stacks `
    --stack-name $StackName --profile $Profile --region $Region `
    --query "Stacks[0].Outputs[?OutputKey=='WebsiteUrl'].OutputValue" --output text
$BucketName = aws cloudformation describe-stacks `
    --stack-name $StackName --profile $Profile --region $Region `
    --query "Stacks[0].Outputs[?OutputKey=='WebsiteBucketName'].OutputValue" --output text

Write-Host "API URL:     $ApiUrl"
Write-Host "Website URL: $WebsiteUrl"
Write-Host "Bucket:      $BucketName"

# --------------------------------------------------
# 6. フロントエンドを S3 にデプロイ
# --------------------------------------------------
Write-Host "`n[6/6] Deploying frontend to S3..." -ForegroundColor Yellow
$FrontendDir = Join-Path $ScriptDir "frontend"

# config.js 生成（API Gateway の URL を埋め込み）
$ConfigPath = Join-Path $FrontendDir "config.js"
"window.GEZA_API_URL = `"$ApiUrl`";" | Set-Content -Path $ConfigPath -Encoding UTF8

# videos/ 以外を同期（動画は別途アップロード）
aws s3 sync $FrontendDir "s3://$BucketName/" `
    --profile $Profile --region $Region `
    --delete --exclude "videos/*"
Test-AwsResult "Frontend S3 sync"
Write-Host "Frontend deployed."

# --------------------------------------------------
# 完了
# --------------------------------------------------
Write-Host "`n========================================" -ForegroundColor Green
Write-Host " Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Website: $WebsiteUrl" -ForegroundColor Cyan
Write-Host "API:     $ApiUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "--- Video Upload Commands ---" -ForegroundColor Yellow
Write-Host "  aws s3 cp anger.mp4         s3://$BucketName/videos/anger.mp4         --profile $Profile"
Write-Host "  aws s3 cp acceptance.mp4     s3://$BucketName/videos/acceptance.mp4     --profile $Profile"
Write-Host "  aws s3 cp disappointment.mp4 s3://$BucketName/videos/disappointment.mp4 --profile $Profile"
Write-Host ""
