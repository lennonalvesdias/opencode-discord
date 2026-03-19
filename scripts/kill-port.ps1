# kill-port.ps1
# Encerra o processo que está escutando em uma porta TCP específica no Windows.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\kill-port.ps1 [-Port 9090]

param(
    [int]$Port = 9090
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "[>>] Procurando processo na porta $Port..." -ForegroundColor Cyan

# ─── Localiza o PID que está escutando na porta ───────────────────────────────
try {
    $conexao = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

    if (-not $conexao) {
        Write-Host "[INFO] Nenhum processo encontrado na porta $Port." -ForegroundColor Yellow
        Write-Host ""
        exit 0
    }

    $processoId = $conexao.OwningProcess | Select-Object -First 1

    # ─── Obtém o nome do processo para exibir mensagem informativa ────────────
    $processo = Get-Process -Id $processoId -ErrorAction SilentlyContinue
    $nomeProcesso = if ($processo) { $processo.Name } else { "desconhecido" }

    # ─── Encerra o processo ───────────────────────────────────────────────────
    Stop-Process -Id $processoId -Force -ErrorAction Stop

    Write-Host "[OK] Processo $processoId ($nomeProcesso.exe) encerrado na porta $Port." -ForegroundColor Green
    Write-Host ""

} catch {
    Write-Host "[ERRO] Erro ao tentar encerrar o processo na porta $Port." -ForegroundColor Red
    Write-Host "   Detalhe: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
