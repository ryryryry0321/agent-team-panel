# Todo 
モーニングタスク
  - READMEをまともに書く ここを盛り込む (英語, agents decects automaticallyは特徴としていれる, CI/CDラベルもつける, アプリケーションの使用法,  動作保証はMacOSのみ,Quickスタート（.App配布はまだ設定が整っていないと）,開発用ローカルセットアップ, tmux環境前提は伝えとく, shだとnodeもいるか )
  - Zennに記事入れる
    - ハマりポイントだけ書く
    - agent viewうまくとれなかったところとかね・実際のコード探しつつ、具体例にする感じでね
    ```
    なるほど。最初は tmux capture-pane でpaneの内容をスナップショット的に取得してたけど、それだとリアルタイム性がなくてビューが更新されなかった。

最終的に今の方式に変わった：

metadata → tmux list-panes でpane情報をポーリング
output stream → pty.spawn("tmux", ["attach-session", ...]) でlinked sessionにattachしてリアルタイムにデータを流す
capture-paneはその瞬間の画面の静止画。attach-session経由のPTYストリームは動画。agentが動いてる様子をリアルタイムで見るには後者が必要だった。

十分ネタになる。要点は：

「Electronからtmux paneの中身をリアルタイム表示したいなら、capture-paneではなくattach-sessionのPTYストリームを使え」

記事の骨子：

capture-pane → スナップショット。ポーリングしても描画がカクカク、ANSIエスケープも不完全
pty.spawn("tmux", ["attach-session", ...]) → linked sessionにattachしてストリームで流す。リアルタイム、xterm.jsとの相性も良い
ただしnode-ptyのspawn-helperがasarに閉じ込められる罠 → electron-builderのasarUnpackで解決
Electron + tmux + node-pty の組み合わせ自体がニッチで、日本語どころか英語でもまとまった情報がほぼない。刺さる人には刺さる。

記事にする？
    ```
-- ここまででOK -- 

  - Codexにコードの問題点洗い出してもらってリファクタする
  　- 大体リファクタした後動かない

  - .appファイルでのリリース
    - workflowおちるので修正
  
.appパッケージングでClaudeCodeが見えない問題の原因:

pty.spawn("tmux", ...) を呼ぶと、node-ptyが内部で spawn-helper という拡張子なしのネイティブバイナリをforkしてPTY（仮想端末）を作り、その上でtmuxが動く。electron-packagerはこの spawn-helper を通常ファイルと判断してasar内に圧縮してしまい、OSが実行できず posix_spawnp failed で落ちていた。electron-builderはディレクトリごとunpackするため、この問題が起きない。

