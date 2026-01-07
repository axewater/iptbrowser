# IPT Browser Startup Script
# Activates virtual environment and runs Flask app

# Check if venv exists
if (-Not (Test-Path ".\venv\Scripts\Activate.ps1")) {
    Write-Host "Virtual environment not found. Creating venv..." -ForegroundColor Yellow
    python -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create virtual environment. Make sure Python is installed." -ForegroundColor Red
        exit 1
    }
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Green
& ".\venv\Scripts\Activate.ps1"

# Check if requirements are installed
Write-Host "Checking dependencies..." -ForegroundColor Green
$packages = pip list 2>$null
if (-Not ($packages -match "Flask")) {
    Write-Host "Installing dependencies from requirements.txt..." -ForegroundColor Yellow
    pip install -r requirements.txt
}

# Run the Flask application
Write-Host "Starting IPT Browser..." -ForegroundColor Green
Write-Host "Access the application at: http://localhost:5000" -ForegroundColor Cyan
python app.py
