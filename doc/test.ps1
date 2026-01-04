$word = New-Object -ComObject Word.Application
$doc = $word.Documents.Open("C:\docs\input\L17075 10-06-25.doc")
$doc.SaveAs("C:\docs\output\L17075 10-06-25.docx", 16)
$doc.Close()
$word.Quit()