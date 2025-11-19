use clap::Parser;
use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::PathBuf,
};

/// Command-line arguments for the Agentrix CLI.
#[derive(Debug, Parser, Clone)]
#[command(
    name = "Agentrix",
    version,
    about = "A starter command-line interface for experimenting with Rust.",
    long_about = None
)]
pub struct Args {
    /// Host the HTTP server should bind to.
    #[arg(long, default_value_t = IpAddr::V4(Ipv4Addr::UNSPECIFIED))]
    pub host: IpAddr,

    /// Port the HTTP server should bind to.
    #[arg(long, default_value_t = 4567)]
    pub port: u16,

    /// Working directory the server will operate within.
    #[arg(long, default_value = ".", value_name = "PATH")]
    pub workdir: PathBuf,
}

impl Args {
    pub fn addr(&self) -> SocketAddr {
        SocketAddr::new(self.host, self.port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn addr_combines_host_and_port() {
        let args = Args {
            host: IpAddr::V4(Ipv4Addr::LOCALHOST),
            port: 8080,
            workdir: PathBuf::from("/tmp"),
        };

        assert_eq!(args.addr(), SocketAddr::from(([127, 0, 0, 1], 8080)));
    }
}
