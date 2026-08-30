$file = $args[0]
(Get-Content $file) -replace '^pick 887c995', 'reword 887c995' | Set-Content $file
