package com.loanflow.underwriting;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.loanflow")
public class UnderwritingServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(UnderwritingServiceApplication.class, args);
    }
}
