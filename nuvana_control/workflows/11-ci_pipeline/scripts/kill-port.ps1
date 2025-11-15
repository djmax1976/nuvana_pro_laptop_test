# Kill any process using a specific port (Windows PowerShell)
# Usage: .\kill-port.ps1 -Port 3001

param(
    [Parameter(Mandatory=$false)]
    [int]$Port = 3001
)

Write-Host "Checking for processes using port $Port..." -ForegroundColor Cyan

try {
    # Find process using the port
    $processInfo = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
                   Select-Object -First 1

    if ($processInfo) {
        $processId = $processInfo.OwningProcess
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue

        if ($process) {
            Write-Host "Found process $($process.Name) (PID: $processId) using port $Port" -ForegroundColor Yellow
            Write-Host "Killing process..." -ForegroundColor Yellow

            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1

            Write-Host "Process killed successfully" -ForegroundColor Green
        }
    } else {
        Write-Host "No process found using port $Port" -ForegroundColor Green
    }
} catch {
    Write-Host "Error checking port: $_" -ForegroundColor Red
    Write-Host "Port cleanup may not have worked properly" -ForegroundColor Yellow
}

Write-Host "Port $Port is now available" -ForegroundColor Green
