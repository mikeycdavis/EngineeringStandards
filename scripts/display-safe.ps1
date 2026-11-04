# Display-safe output for the PowerShell wrappers (ST-48 b). Dot-source this file; it defines functions only.
#
#   ConvertTo-DisplaySafe VALUE            escape every control, format and bidi character, line feed included,
#                                          so one field cannot forge a second physical line
#   ConvertTo-DisplaySafe VALUE -Native    the value is the output of a native command (git, docker). PowerShell
#                                          decodes that with the console code page, so a UTF-8 character reaches
#                                          here as mojibake and would leave unescaped; the value is re-decoded as
#                                          UTF-8 first. Never pass a value that came from a .NET API.
#   ConvertTo-DisplaySafe VALUE -Layout    keep the line feed and tab that lay a block of text out, and a CR LF
#                                          pair; escape everything else (a lone CR can overwrite a line)
#
# The escaped set is the one scripts/display-safe.mjs escapes; test/display-safe-wrappers.test.mjs holds the
# two to the same classes. A well-formed surrogate pair is one supplementary character and is escaped only in
# the tag and variation-selector ranges; a lone surrogate is always escaped.
$script:DisplaySafePattern = [regex]::new(
    '[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\ufff9-\ufffc]' +
    '|\uDB40[\uDC00-\uDC7F]|\uDB40[\uDD00-\uDDEF]' +
    '|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]'
)

function ConvertTo-DisplaySafe {
    param(
        [AllowNull()] [AllowEmptyString()] $Value,
        [switch] $Layout,
        [switch] $Native
    )
    if ($null -eq $Value) { return '' }
    $text = [string] $Value
    if ($Native) {
        try { $text = [System.Text.Encoding]::UTF8.GetString([Console]::OutputEncoding.GetBytes($text)) } catch { $text = [string] $Value }
    }
    if ($Layout) { $text = $text.Replace("`r`n", "`n") }
    $escaped = $script:DisplaySafePattern.Replace($text, {
            param($m)
            $s = $m.Value
            if ($Layout -and ($s -eq "`n" -or $s -eq "`t")) { return $s }
            if ($s -eq "`n") { return '\n' }
            if ($s -eq "`r") { return '\r' }
            if ($s -eq "`t") { return '\t' }
            if ($s.Length -eq 2) {
                return ('\u{' + ([char]::ConvertToUtf32($s, 0)).ToString('x') + '}')
            }
            return ('\u' + ([int][char] $s).ToString('x4'))
        })
    if ($Layout) { $escaped = $escaped.Replace("`n", [Environment]::NewLine) }
    return $escaped
}
