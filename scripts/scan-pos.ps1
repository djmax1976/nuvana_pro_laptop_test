# POS Network Scanner for Gilbarco Passport
# Scans known hosts for common Passport ports

$hosts = @("10.1.10.1", "10.1.10.104", "10.1.10.114", "10.1.10.240")
$ports = @(80, 443, 5000, 5001, 10001, 8080, 8443)

Write-Host "Scanning for Gilbarco Passport POS devices..." -ForegroundColor Cyan
Write-Host ""

foreach ($ip in $hosts) {
    Write-Host "Checking $ip..." -ForegroundColor Yellow
    $openPorts = @()

    foreach ($port in $ports) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $ar = $tcp.BeginConnect($ip, $port, $null, $null)
            $wait = $ar.AsyncWaitHandle.WaitOne(500, $false)

            if ($wait -and $tcp.Connected) {
                $openPorts += $port
                Write-Host "  Port $port OPEN" -ForegroundColor Green
            }
            $tcp.Close()
        } catch {
            # Port closed or error
        }
    }

    # If port 80 or 443 is open, try to get HTTP response
    if ($openPorts -contains 80 -or $openPorts -contains 443) {
        $protocol = if ($openPorts -contains 443) { "https" } else { "http" }
        $checkPort = if ($openPorts -contains 443) { 443 } else { 80 }

        try {
            [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
            $response = Invoke-WebRequest -Uri "${protocol}://${ip}:${checkPort}/" -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue

            if ($response.Content -match "Passport|Gilbarco|Veeder-Root|VR") {
                Write-Host "  ** GILBARCO PASSPORT DETECTED **" -ForegroundColor Magenta
            }

            # Check for server header
            $server = $response.Headers["Server"]
            if ($server) {
                Write-Host "  Server: $server" -ForegroundColor Gray
            }
        } catch {
            Write-Host "  (HTTP check failed: $($_.Exception.Message))" -ForegroundColor DarkGray
        }
    }

    # If port 5000 is open, try Passport API
    if ($openPorts -contains 5000) {
        Write-Host "  ** Possible Passport API on port 5000 **" -ForegroundColor Magenta

        try {
            $xmlRequest = @"
<?xml version="1.0" encoding="UTF-8"?>
<PassportRequest Version="1.0">
    <Authentication/>
    <Command>GetSystemInfo</Command>
</PassportRequest>
"@
            $response = Invoke-WebRequest -Uri "http://${ip}:5000/passport/api" -Method POST -Body $xmlRequest -ContentType "application/xml" -TimeoutSec 5 -UseBasicParsing -ErrorAction SilentlyContinue
            Write-Host "  API Response: $($response.Content.Substring(0, [Math]::Min(200, $response.Content.Length)))..." -ForegroundColor Cyan
        } catch {
            Write-Host "  (Passport API check failed)" -ForegroundColor DarkGray
        }
    }

    Write-Host ""
}

Write-Host "Scan complete." -ForegroundColor Cyan
