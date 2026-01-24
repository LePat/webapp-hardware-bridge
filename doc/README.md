# Demo pages of Webapp-Hardware-Bridge

## Point Of Sale Cockpit 

[whb-console](../demo/whb-console.html)

### Requirements:

- Webapp-Hardware-Bridge GUI or Server is running
- run command like `socat -dddd pty,raw,echo=0 pty,raw,echo=0` to simulate serial ports needed and configure them in WHB
- escpos-tools project is available near webapp-hardware-bridge project (both projects are in the same directory)
- to simulate continuous weight transmission through serial port (like AWH-30 Weighing Scale), launch the command `watch -n 1 ./2kg13.sh /dev/pts/5' in demo directory

### Content:

- Setup and virtual 2 lines customer display
- Setup and virtual TakePOS/Weighing Scale using Dialog-06 protocol
- simple WebSocket console for various tests
- Setup and virtual thermal printer using ESC-POS protocol from EPSON

![WHB POS Cockpit](img/whb-console.png)

## Printer

[printer-advanced](../demo/printer-advanced.html)

[printer-annotation](../demo/printer-annotation.html)

[printer-basic](../demo/printer-basic.html)

## Serial

[serial-basic](../demo/serial-basic.html)

[serial-weight](../demo/serial-weight.html)
