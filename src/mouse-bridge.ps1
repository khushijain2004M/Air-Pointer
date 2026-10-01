Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class NativeMouse {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);

    public const uint LEFT_DOWN = 0x0002;
    public const uint LEFT_UP = 0x0004;
    public const uint RIGHT_DOWN = 0x0008;
    public const uint RIGHT_UP = 0x0010;
    public const uint WHEEL = 0x0800;
}
"@

$leftDown = $false

while ($null -ne ($line = [Console]::In.ReadLine())) {
    try {
        $command = $line | ConvertFrom-Json
        switch ($command.type) {
            "move" {
                [NativeMouse]::SetCursorPos([int]$command.x, [int]$command.y) | Out-Null
            }
            "leftDown" {
                if (-not $leftDown) {
                    [NativeMouse]::mouse_event([NativeMouse]::LEFT_DOWN, 0, 0, 0, [UIntPtr]::Zero)
                    $leftDown = $true
                }
            }
            "leftClick" {
                [NativeMouse]::mouse_event([NativeMouse]::LEFT_DOWN, 0, 0, 0, [UIntPtr]::Zero)
                [NativeMouse]::mouse_event([NativeMouse]::LEFT_UP, 0, 0, 0, [UIntPtr]::Zero)
            }
            "doubleClick" {
                [NativeMouse]::mouse_event([NativeMouse]::LEFT_DOWN, 0, 0, 0, [UIntPtr]::Zero)
                [NativeMouse]::mouse_event([NativeMouse]::LEFT_UP, 0, 0, 0, [UIntPtr]::Zero)
                Start-Sleep -Milliseconds 70
                [NativeMouse]::mouse_event([NativeMouse]::LEFT_DOWN, 0, 0, 0, [UIntPtr]::Zero)
                [NativeMouse]::mouse_event([NativeMouse]::LEFT_UP, 0, 0, 0, [UIntPtr]::Zero)
            }
            "leftUp" {
                if ($leftDown) {
                    [NativeMouse]::mouse_event([NativeMouse]::LEFT_UP, 0, 0, 0, [UIntPtr]::Zero)
                    $leftDown = $false
                }
            }
            "rightClick" {
                [NativeMouse]::mouse_event([NativeMouse]::RIGHT_DOWN, 0, 0, 0, [UIntPtr]::Zero)
                [NativeMouse]::mouse_event([NativeMouse]::RIGHT_UP, 0, 0, 0, [UIntPtr]::Zero)
            }
            "scroll" {
                [NativeMouse]::mouse_event([NativeMouse]::WHEEL, 0, 0, [int]$command.delta, [UIntPtr]::Zero)
            }
            "release" {
                if ($leftDown) {
                    [NativeMouse]::mouse_event([NativeMouse]::LEFT_UP, 0, 0, 0, [UIntPtr]::Zero)
                    $leftDown = $false
                }
            }
        }
    } catch {
        [Console]::Error.WriteLine($_.Exception.Message)
    }
}

if ($leftDown) {
    [NativeMouse]::mouse_event([NativeMouse]::LEFT_UP, 0, 0, 0, [UIntPtr]::Zero)
}
